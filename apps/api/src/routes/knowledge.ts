import { sources } from '@tectonic/db';
import { AskInputSchema, CheckInputSchema, DisputeInputSchema, SupersedeInputSchema, assess, naiveAnswer, scoreSource, verdictFor, roleAtLeast, type Access, type CheckResult } from '@tectonic/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext, AppEnv } from '../app.ts';
import { conflict, forbidden, notFound } from '../errors.ts';
import { getProjectRole, isSourceOwner, userCanSeeSource } from '../permissions.ts';
import { serializeSource } from '../serializers.ts';
import { visibleSources as loadVisibleSources } from '../sources.ts';
import { extractClaims } from '../claims.ts';
import { takeLlmBudget } from '../llm-budget.ts';
import { jsonBody } from '../validate.ts';

const EXAMPLES = ['Tot wanneer mag Atlas loonmutaties aanleveren?', 'Binnen welke termijn moet een ziekmelding doorgegeven worden?'];

export function knowledgeRoutes(ctx: AppContext) {
  const { db, realtime, config } = ctx;
  const router = new Hono<AppEnv>();

  const visibleSources = (userId: string) => loadVisibleSources(db, userId);
  // A target the caller cannot see must not leak through its code ("Vervangen door S9").
  const serializeVisible = (rows: Parameters<typeof serializeSource>[0][]) => {
    const codes = new Set(rows.map((r) => r.code));
    return rows.map((r) => serializeSource(codes.has(r.supersededBy ?? '') ? r : { ...r, supersededBy: null }));
  };

  router.get('/api/access', async (c) => {
    const { teams, rows } = await visibleSources(c.get('principal').userId);
    const clients = [...new Set(rows.map((r) => r.client).filter((x): x is string => x !== null))].sort();
    return c.json({ teams, clients, examples: EXAMPLES } satisfies Access);
  });

  router.get('/api/sources', async (c) => {
    const { userId } = c.get('principal');
    const { teams, rows } = await visibleSources(userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const period = new Date().toISOString().slice(0, 7);
    return c.json(
      serializeVisible(rows).map((s) => {
        const ctx = { country: s.country, client: s.client, period };
        return { ...s, projectName: names.get(s.projectId) ?? '', onderbouwing: scoreSource(s, ctx), verdict: verdictFor(s, ctx) };
      }),
    );
  });

  router.post('/api/ask', jsonBody(AskInputSchema), async (c) => {
    const { question, country, client, period } = c.req.valid('json');
    const { teams, rows } = await visibleSources(c.get('principal').userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    return c.json(assess(question, serializeVisible(rows), names, { country, client, period }));
  });

  // ponytail: the claim's digits must all appear in the source value ('25 oktober' vs '22 oktober 2026'); no date parsing, so '25 okt' also conflicts.
  const statesOtherValue = (claim: string, best?: { code: string; value: string | null } | null) => {
    const digits = claim.match(/\d+/g);
    return best?.value && digits && !digits.every((d) => best.value!.includes(d)) ? { code: best.code, value: best.value } : null;
  };

  // Claims come from the LLM when a key is set, else sentence split (see claims.ts); matching stays keyword overlap via assess.
  router.post('/api/check', jsonBody(CheckInputSchema), async (c) => {
    const { text, country, client = null, period = new Date().toISOString().slice(0, 7) } = c.req.valid('json');
    const { userId } = c.get('principal');
    const { teams, rows } = await visibleSources(userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const claims: CheckResult['claims'] = [];
    const contradictions: CheckResult['contradictions'] = [];
    const llm = config.llm && rows.length > 0 && takeLlmBudget(userId) ? config.llm : null;
    for (const { claim, country: found } of await extractClaims(text, llm)) {
      const r = assess(claim, serializeVisible(rows), names, { country: found ?? country, client, period });
      claims.push({ text: claim, topic: r.topic, status: r.status, statusLabel: r.statusLabel, conflict: statesOtherValue(claim, r.best) });
      for (const source of r.sources) {
        if (source.verdict.kind !== 'exception' && source.verdict.kind !== 'general') contradictions.push({ claim, source });
      }
    }
    return c.json({ claims, contradictions } satisfies CheckResult);
  });
  // --- naive answer (issue #3) ---
  router.post('/api/naive-answer', jsonBody(AskInputSchema), async (c) => {
    const { rows } = await visibleSources(c.get('principal').userId);
    return c.json(naiveAnswer(c.req.valid('json').question, serializeVisible(rows)));
  });
  // --- end naive answer ---

  // A malformed id is simply "no such source" (not a Postgres uuid error -> 500). Covers every :sourceId route.
  router.use('/api/sources/:sourceId/*', async (c, next) => {
    if (!z.uuid().safeParse(c.req.param('sourceId')).success) throw notFound('Source');
    await next();
  });

  router.post('/api/sources/:sourceId/approve', async (c) => {
    const principal = c.get('principal');
    const [source] = await db.select().from(sources).where(eq(sources.id, c.req.param('sourceId'))).limit(1);
    const role = source ? await getProjectRole(db, source.projectId, principal.userId) : null;
    // Not a member means "no such source": the existence of a source in a team you cannot see is not revealed.
    if (!source || !role || !(await userCanSeeSource(db, source, principal.userId))) throw notFound('Source');
    if (!roleAtLeast(role, 'editor')) throw forbidden('Your role cannot approve sources');
    // Only the accountable owner can vouch for a source; the team owner can adopt an ownerless one.
    if (!isSourceOwner(source, principal.userId, role)) {
      throw forbidden('Only the owner of this source can approve it');
    }
    if (source.status === 'superseded') throw conflict('A superseded source cannot be approved');

    await db
      .update(sources)
      .set({ status: 'approved', approvedById: principal.userId, ownerId: source.ownerId ?? principal.userId, updatedAt: new Date() })
      .where(and(eq(sources.id, source.id), eq(sources.projectId, source.projectId)));
    // Persisted above; only now do subscribers hear about it.
    realtime.publish(source.projectId, { kind: 'sources.changed' }, principal.userId, source.audienceProjectIds);
    return c.json({ ok: true as const });
  });

  router.post('/api/sources/:sourceId/dispute', jsonBody(DisputeInputSchema), async (c) => {
    const principal = c.get('principal');
    const { disputed } = c.req.valid('json');
    const [source] = await db.select().from(sources).where(eq(sources.id, c.req.param('sourceId'))).limit(1);
    const role = source ? await getProjectRole(db, source.projectId, principal.userId) : null;
    if (!source || !role || !(await userCanSeeSource(db, source, principal.userId))) throw notFound('Source');
    if (!roleAtLeast(role, 'editor')) throw forbidden('Your role cannot dispute sources');
    // Anyone may raise doubt; only the accountable owner may declare it resolved.
    if (!disputed && !isSourceOwner(source, principal.userId, role)) {
      throw forbidden('Only the owner of this source can resolve a dispute');
    }
    await db
      .update(sources)
      .set({ disputed, disputedById: disputed ? principal.userId : null, updatedAt: new Date() })
      .where(and(eq(sources.id, source.id), eq(sources.projectId, source.projectId)));
    realtime.publish(source.projectId, { kind: 'sources.changed' }, principal.userId, source.audienceProjectIds);
    return c.json({ ok: true as const });
  });

  router.post('/api/sources/:sourceId/supersede', jsonBody(SupersedeInputSchema), async (c) => {
    const principal = c.get('principal');
    const { supersededBy } = c.req.valid('json');
    const [source] = await db.select().from(sources).where(eq(sources.id, c.req.param('sourceId'))).limit(1);
    const role = source ? await getProjectRole(db, source.projectId, principal.userId) : null;
    if (!source || !role || !(await userCanSeeSource(db, source, principal.userId))) throw notFound('Source');
    if (!roleAtLeast(role, 'editor')) throw forbidden('Your role cannot supersede sources');
    // Retiring a source is the owner's call, like approving it.
    if (!isSourceOwner(source, principal.userId, role)) throw forbidden('Only the owner of this source can mark it superseded');
    // The newer version must be one the caller may see, on the same topic, and not itself replaced (no cycles).
    const { rows } = await visibleSources(principal.userId);
    const next = rows.find((r) => r.code === supersededBy);
    if (!next) throw notFound('Newer source');
    if (next.id === source.id) throw conflict('A source cannot replace itself');
    if (next.topic !== source.topic) throw conflict('The newer version must be on the same topic');
    if (next.status === 'superseded' || next.supersededBy !== null) throw conflict('The newer version is itself superseded');
    // Conservative: the replacement must be confirmed, still valid today, and not start earlier than the source it replaces.
    const today = new Date().toISOString().slice(0, 10);
    if (next.status !== 'approved') throw conflict('The newer version must be approved');
    if (next.validTo !== null && next.validTo.slice(0, 10) < today) throw conflict('The newer version is expired');
    if (next.validFrom.slice(0, 10) < source.validFrom.slice(0, 10)) throw conflict('The newer version must not be older than the source it replaces');
    await db
      .update(sources)
      .set({ status: 'superseded', supersededBy: next.code, updatedAt: new Date() })
      .where(and(eq(sources.id, source.id), eq(sources.projectId, source.projectId)));
    // The newer source may live in another team: tell both.
    realtime.publish(source.projectId, { kind: 'sources.changed' }, principal.userId, source.audienceProjectIds);
    if (next.projectId !== source.projectId) realtime.publish(next.projectId, { kind: 'sources.changed' }, principal.userId, next.audienceProjectIds);
    return c.json({ ok: true as const });
  });

  return router;
}
