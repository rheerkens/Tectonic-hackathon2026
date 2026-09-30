import { projectMembers, projects, sources, type Database } from '@tectonic/db';
import { AskInputSchema, CheckInputSchema, DisputeInputSchema, SourceIdSchema, assess, naiveAnswer, scoreSource, verdictFor, roleAtLeast, type Access, type CheckResult } from '@tectonic/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { conflict, forbidden, notFound } from '../errors.ts';
import { getProjectRole } from '../permissions.ts';
import { serializeSource } from '../serializers.ts';
import { jsonBody } from '../validate.ts';

/** Malformed ids are "no such source" (404), not a Postgres cast error (500). */
function sourceIdParam(raw: string) {
  const id = SourceIdSchema.safeParse(raw);
  if (!id.success) throw notFound('Source');
  return id.data;
}

const EXAMPLES = ['Tot wanneer mag Atlas loonmutaties aanleveren?', 'Binnen welke termijn moet een ziekmelding doorgegeven worden?'];

/** The teams a user belongs to. Everything the API shows is scoped to these: access is part of trust. */
async function myTeams(db: Database, userId: string) {
  return db
    .select({ id: projects.id, name: projects.name, color: projects.color, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId));
}

export function knowledgeRoutes(ctx: AppContext) {
  const { db, realtime } = ctx;
  const router = new Hono<AppEnv>();

  async function visibleSources(userId: string) {
    const teams = await myTeams(db, userId);
    if (teams.length === 0) return { teams, rows: [] };
    const rows = await db.select().from(sources).where(inArray(sources.projectId, teams.map((t) => t.id)));
    return { teams, rows };
  }

  router.get('/api/access', async (c) => {
    const { teams, rows } = await visibleSources(c.get('principal').userId);
    const clients = [...new Set(rows.map((r) => r.client).filter((x): x is string => x !== null))].sort();
    return c.json({ teams, clients, examples: EXAMPLES } satisfies Access);
  });

  router.get('/api/sources', async (c) => {
    const { teams, rows } = await visibleSources(c.get('principal').userId);
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

  // ponytail: stub, sentence split + keyword overlap via assess; no client/NLP, period = this month.
  router.post('/api/check', jsonBody(CheckInputSchema), async (c) => {
    const { text, country } = c.req.valid('json');
    const { teams, rows } = await visibleSources(c.get('principal').userId);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const ctx = { country, client: null, period: new Date().toISOString().slice(0, 7) };
    const claims: CheckResult['claims'] = [];
    const contradictions: CheckResult['contradictions'] = [];
    for (const claim of text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length >= 3)) {
      const r = assess(claim, rows.map(serializeSource), names, ctx);
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

  router.post('/api/sources/:sourceId/approve', async (c) => {
    const principal = c.get('principal');
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceIdParam(c.req.param('sourceId')))).limit(1);
    const role = source ? await getProjectRole(db, source.projectId, principal.userId) : null;
    // Not a member means "no such source": the existence of a source in a team you cannot see is not revealed.
    if (!source || !role) throw notFound('Source');
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
    realtime.publish(source.projectId, { kind: 'sources.changed' }, principal.userId);
    return c.json({ ok: true as const });
  });

  router.post('/api/sources/:sourceId/dispute', jsonBody(DisputeInputSchema), async (c) => {
    const principal = c.get('principal');
    const { disputed } = c.req.valid('json');
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceIdParam(c.req.param('sourceId')))).limit(1);
    const role = source ? await getProjectRole(db, source.projectId, principal.userId) : null;
    if (!source || !role) throw notFound('Source');
    if (!roleAtLeast(role, 'editor')) throw forbidden('Your role cannot dispute sources');
    // Anyone may raise doubt; only the accountable owner may declare it resolved.
    if (!disputed && source.ownerId !== principal.userId && !(role === 'owner' && source.ownerId === null)) {
      throw forbidden('Only the owner of this source can resolve a dispute');
    }
    await db
      .update(sources)
      .set({ disputed, disputedById: disputed ? principal.userId : null, updatedAt: new Date() })
      .where(and(eq(sources.id, source.id), eq(sources.projectId, source.projectId)));
    realtime.publish(source.projectId, { kind: 'sources.changed' }, principal.userId);
    return c.json({ ok: true as const });
  });

  return router;
}
