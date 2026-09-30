import { knowledgeSources, type KnowledgeSourceRow } from '@tectonic/db';
import { AskInputSchema, CreateSourceInputSchema, FlagSourceInputSchema, assess, findIssues, scoreSource } from '@tectonic/shared';
import type { Source, SourceWithTrust, SourcesOverview } from '@tectonic/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { forbidden, notFound } from '../errors.ts';
import { requireProjectAccess } from '../permissions.ts';
import { jsonBody } from '../validate.ts';

const iso = (d: Date) => d.toISOString();

function serializeSource(row: KnowledgeSourceRow): Source {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    kind: row.kind,
    topic: row.topic,
    country: row.country as Source['country'],
    claim: row.claim,
    content: row.content,
    ownerId: row.ownerId,
    verifiedById: row.verifiedById,
    flaggedOutdated: row.flaggedOutdated,
    reviewedAt: iso(row.reviewedAt),
    createdAt: iso(row.createdAt),
  };
}

const withTrust = (row: KnowledgeSourceRow): SourceWithTrust => {
  const source = serializeSource(row);
  return { ...source, trust: scoreSource(source, { country: null, now: Date.now() }) };
};

export function knowledgeRoutes(ctx: AppContext) {
  const { db, realtime } = ctx;
  const router = new Hono<AppEnv>();

  /** Every query is scoped by projectId: a source id from another portfolio is a 404, never data. */
  const loadAll = (projectId: string) => db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId)).orderBy(asc(knowledgeSources.createdAt));
  const loadOne = async (projectId: string, sourceId: string) => {
    const [row] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))
      .limit(1);
    if (!row) throw notFound('Source');
    return row;
  };

  router.get('/api/projects/:projectId/sources', async (c) => {
    const projectId = c.req.param('projectId');
    await requireProjectAccess(db, projectId, c.get('principal').userId, 'viewer');
    const sources = (await loadAll(projectId)).map(serializeSource);
    const now = Date.now();
    return c.json({
      sources: sources.map((s) => ({ ...s, trust: scoreSource(s, { country: null, now }) })),
      issues: findIssues(sources, now),
    } satisfies SourcesOverview);
  });

  router.post('/api/projects/:projectId/ask', jsonBody(AskInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    await requireProjectAccess(db, projectId, c.get('principal').userId, 'viewer');
    const { question, country } = c.req.valid('json');
    const sources = (await loadAll(projectId)).map(serializeSource);
    return c.json(assess(question, sources, { country, now: Date.now() }));
  });

  router.post('/api/projects/:projectId/sources', jsonBody(CreateSourceInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const input = c.req.valid('json');
    // The creator owns what they add: that is the accountability the trust score rewards.
    const [created] = await db.insert(knowledgeSources).values({ ...input, projectId, ownerId: principal.userId }).returning();
    if (!created) throw new Error('insert failed');
    realtime.publish(projectId, { kind: 'sources.changed' }, principal.userId);
    return c.json(withTrust(created), 201);
  });

  router.post('/api/projects/:projectId/sources/:sourceId/verify', async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    const { role } = await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const existing = await loadOne(projectId, c.req.param('sourceId'));
    // Only the accountable owner (or the portfolio owner, for ownerless sources) can vouch for a source.
    if (existing.ownerId !== principal.userId && !(role === 'owner' && !existing.ownerId)) {
      throw forbidden('Only the owner of this source can verify it');
    }
    const [updated] = await db
      .update(knowledgeSources)
      .set({ verifiedById: principal.userId, ownerId: existing.ownerId ?? principal.userId, flaggedOutdated: false, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(knowledgeSources.id, existing.id), eq(knowledgeSources.projectId, projectId)))
      .returning();
    if (!updated) throw notFound('Source');
    realtime.publish(projectId, { kind: 'sources.changed' }, principal.userId);
    return c.json(withTrust(updated));
  });

  router.post('/api/projects/:projectId/sources/:sourceId/flag', jsonBody(FlagSourceInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const existing = await loadOne(projectId, c.req.param('sourceId'));
    const [updated] = await db
      .update(knowledgeSources)
      .set({ flaggedOutdated: c.req.valid('json').flagged, updatedAt: new Date() })
      .where(and(eq(knowledgeSources.id, existing.id), eq(knowledgeSources.projectId, projectId)))
      .returning();
    if (!updated) throw notFound('Source');
    realtime.publish(projectId, { kind: 'sources.changed' }, principal.userId);
    return c.json(withTrust(updated));
  });

  return router;
}
