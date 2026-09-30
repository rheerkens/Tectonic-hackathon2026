import { sources } from '@tectonic/db';
import { AskInputSchema, CheckInputSchema, DisputeInputSchema, SupersedeInputSchema, assess, naiveAnswer, scoreSource, verdictFor, roleAtLeast, type Access, type CheckResult } from '@tectonic/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext, AppEnv } from '../app.ts';
import { conflict, forbidden, notFound } from '../errors.ts';
import { getProjectRole, userCanSeeSource } from '../permissions.ts';
import { serializeSource } from '../serializers.ts';
import { visibleSources as loadVisibleSources } from '../sources.ts';
import { extractClaims } from '../claims.ts';
import { takeLlmBudget } from '../llm-budget.ts';
import { jsonBody } from '../validate.ts';

/**
 * Questions for the chat chips and the first load of the search page; see docs/demo-scenarios.md. The first one is the main demo
 * question (the search page opens on it). Order matters: reliable answer, conflicting sources, access-scoped answer, knowledge gap.
 */
const EXAMPLES = [
  'Tot wanneer mag Atlas loonmutaties aanleveren?',
  'Binnen welke termijn moet een ziekmelding doorgegeven worden?',
  'Wanneer wordt de eindejaarspremie voor Atlas uitbetaald?',
  'Wat is de regel voor de dertiende maand?',
];

export function knowledgeRoutes(ctx: AppContext) {
  const { db, realtime, config } = ctx;
  const router = new Hono<AppEnv>();

  const visibleSources = (userId: string) => loadVisibleSources(db, userId);

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
      rows.map(serializeSource).map((s) => {
        const ctx = { country: s.country, client: s.client, period };
        return { ...s, projectName: names.get(s.projectId) ?? '', onderbouwing: scoreSource(s, ctx), verdict: verdictFor(s, ctx) };
      }),
    );
  });

  router.post('/api/ask', jsonBody(AskInputSchema), async (c) => {
    const { question, country, client, period } = c.req.valid('json');
    const { teams, rows } = await visibleSources(c.get('principal').userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    return c.json(assess(question, rows.map(serializeSource), names, { country, client, period }));
  });

  // Claims come from the LLM when a key is set, else sentence split (see claims.ts); matching stays keyword overlap via assess.
  router.post('/api/check', jsonBody(CheckInputSchema), async (c) => {
    const { text, country } = c.req.valid('json');
    const { userId } = c.get('principal');
    const { teams, rows } = await visibleSources(userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const period = new Date().toISOString().slice(0, 7);
    const claims: CheckResult['claims'] = [];
    const contradictions: CheckResult['contradictions'] = [];
    const llm = config.llm && rows.length > 0 && takeLlmBudget(userId) ? config.llm : null;
    for (const { claim, country: found } of await extractClaims(text, llm)) {
      const r = assess(claim, rows.map(serializeSource), names, { country: found ?? country, client: null, period });
      claims.push({ text: claim, topic: r.topic, status: r.status, statusLabel: r.statusLabel });
      for (const source of r.sources) {
        if (source.verdict.kind !== 'exception' && source.verdict.kind !== 'general') contradictions.push({ claim, source });
      }
    }
    return c.json({ claims, contradictions } satisfies CheckResult);
  });
  // --- naive answer (issue #3) ---
  router.post('/api/naive-answer', jsonBody(AskInputSchema), async (c) => {
    const { rows } = await visibleSources(c.get('principal').userId);
    return c.json(naiveAnswer(c.req.valid('json').question, rows.map(serializeSource)));
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
    if (source.ownerId !== principal.userId && !(role === 'owner' && source.ownerId === null)) {
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
    if (!disputed && source.ownerId !== principal.userId && !(role === 'owner' && source.ownerId === null)) {
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
    // The newer version must be one the caller may see, on the same topic, and not itself replaced (no cycles).
    const { rows } = await visibleSources(principal.userId);
    const next = rows.find((r) => r.code === supersededBy);
    if (!next) throw notFound('Newer source');
    if (next.id === source.id) throw conflict('A source cannot replace itself');
    if (next.topic !== source.topic) throw conflict('The newer version must be on the same topic');
    if (next.status === 'superseded' || next.supersededBy !== null) throw conflict('The newer version is itself superseded');
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
