import { chatTurns, projectMembers, sources } from '@tectonic/db';
import { CHAT_STREAM_PATH, ProjectChatInputSchema, ProjectChatTurnSchema, api, type ChatEvent, type ChatStatus, type ProjectChatToolCall, type ProjectChatTurn } from '@tectonic/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { AppContext, AppEnv } from '../app.ts';
import { getCodexStatus } from '../project-chat/codex.ts';
import { runProjectChat } from '../project-chat/runner.ts';
import { badRequest, conflict } from '../errors.ts';
import { requireProjectAccess } from '../permissions.ts';
import { jsonBody } from '../validate.ts';

export type ChatRunner = typeof runProjectChat;

export type ChatStatusReader = () => Promise<ChatStatus>;

export function projectChatRoutes(ctx: AppContext, run: ChatRunner = runProjectChat, readStatus: ChatStatusReader = () => getCodexStatus({ productionLike: ctx.config.productionLike })) {
  const router = new Hono<AppEnv>();
  const active = new Set<string>();

  async function accessibleProjectIds(userId: string): Promise<string[]> {
    const memberships = await ctx.db.select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId))
      .orderBy(asc(projectMembers.projectId));
    return memberships.map((membership) => membership.projectId);
  }

  async function sourceAccessHash(projectIds: string[]): Promise<string> {
    if (projectIds.length === 0) return '';
    const rows = await ctx.db.select({ id: sources.id, projectId: sources.projectId, audienceProjectIds: sources.audienceProjectIds })
      .from(sources)
      .where(inArray(sources.projectId, projectIds));
    const snapshot = rows
      .map((source) => [source.id, source.projectId, [...source.audienceProjectIds].sort()])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }

  async function assertTurnAccess(projectId: string, userId: string, contextProjectIds: string[], contextSourceAccessHash: string): Promise<void> {
    await requireProjectAccess(ctx.db, projectId, userId, 'viewer');
    const current = new Set(await accessibleProjectIds(userId));
    if (contextProjectIds.some((contextId) => !current.has(contextId))) {
      throw new Error('A team used by this reply is no longer accessible.');
    }
    if (!contextSourceAccessHash || await sourceAccessHash(contextProjectIds) !== contextSourceAccessHash) {
      throw new Error('Source access changed while this reply was running.');
    }
  }

  async function history(projectId: string, userId: string, allowedProjectIds: string[], currentSourceAccessHash: string): Promise<ProjectChatTurn[]> {
    const accessible = new Set(allowedProjectIds);
    const rows = await ctx.db.select().from(chatTurns)
      .where(and(eq(chatTurns.projectId, projectId), eq(chatTurns.userId, userId)))
      .orderBy(desc(chatTurns.createdAt), desc(chatTurns.id)).limit(500);
    return rows.reverse()
      .filter((row) => row.contextProjectIds.length > 0 && row.contextProjectIds.every((contextId) => accessible.has(contextId)) && row.contextSourceAccessHash === currentSourceAccessHash)
      .slice(-100)
      .map((row) => ProjectChatTurnSchema.parse({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  router.get(api.chatStatus.path, async (c) => c.json(await readStatus()));
  router.get(api.chatHistory.path, async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.get('principal').userId;
    await requireProjectAccess(ctx.db, projectId, userId, 'viewer');
    const allowedProjectIds = await accessibleProjectIds(userId);
    const currentSourceAccessHash = await sourceAccessHash(allowedProjectIds);
    return c.json(await history(projectId, userId, allowedProjectIds, currentSourceAccessHash));
  });

  router.post(CHAT_STREAM_PATH, jsonBody(ProjectChatInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.get('principal').userId;
    await requireProjectAccess(ctx.db, projectId, userId, 'viewer');
    const status = await readStatus();
    if (!status.available) throw badRequest(status.message);
    const key = `${projectId}:${userId}`;
    if (active.has(key)) throw conflict('A reply is already running for this conversation.');
    active.add(key);
    let allowedProjectIds: string[];
    let previous: ProjectChatTurn[];
    let contextSourceAccessHash: string;
    try {
      allowedProjectIds = await accessibleProjectIds(userId);
      if (!allowedProjectIds.includes(projectId)) {
        await requireProjectAccess(ctx.db, projectId, userId, 'viewer');
        throw new Error('Team access changed before chat started.');
      }
      contextSourceAccessHash = await sourceAccessHash(allowedProjectIds);
      previous = await history(projectId, userId, allowedProjectIds, contextSourceAccessHash);
    } catch (error) {
      active.delete(key);
      throw error;
    }
    const message = c.req.valid('json').message;
    c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    c.header('X-Accel-Buffering', 'no');
    return stream(c, async (output) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      output.onAbort(abort);
      c.req.raw.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 180_000);
      let reply = '';
      const tools = new Map<string, ProjectChatToolCall>();
      let turnStatus: ProjectChatTurn['status'] = 'completed';
      let errorMessage: string | undefined;
      async function emit(event: ChatEvent) {
        if (!controller.signal.aborted) await output.write(`${JSON.stringify(event)}\n`);
      }
      try {
        const result = await run({
          ctx, projectId, userId, allowedProjectIds, history: previous.slice(-20), message,
          signal: controller.signal,
          onEvent: async (event) => {
            await assertTurnAccess(projectId, userId, allowedProjectIds, contextSourceAccessHash);
            if (event.type === 'text') reply = event.text;
            if (event.type === 'tool') tools.set(event.tool.id, event.tool);
            await emit(event);
          },
        });
        reply = result.reply;
        for (const tool of result.tools) tools.set(tool.id, tool);
        if (controller.signal.aborted) turnStatus = 'cancelled';
      } catch {
        turnStatus = controller.signal.aborted ? 'cancelled' : 'failed';
        errorMessage = controller.signal.aborted
          ? 'The reply was stopped. You can send another message.'
          : 'OpenAI could not finish this reply. Check your Codex login and try again.';
      }
      try {
        // Membership may have changed while the provider was responding.
        await assertTurnAccess(projectId, userId, allowedProjectIds, contextSourceAccessHash);
        const finishedTools = [...tools.values()].map((tool) => tool.status === 'running'
          ? { ...tool, status: 'failed' as const, result: 'The reply ended before this tool finished.' }
          : tool);
        const [row] = await ctx.db.insert(chatTurns).values({
          projectId, userId, contextProjectIds: allowedProjectIds, contextSourceAccessHash, message, reply, tools: finishedTools, status: turnStatus,
        }).returning();
        if (!row) throw new Error('Chat save failed');
        const turn = ProjectChatTurnSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
        if (errorMessage) await emit({ type: 'error', message: errorMessage });
        await emit({ type: 'done', turn });
      } catch {
        await emit({ type: 'error', message: 'The conversation could not be saved. Check your project access and try again.' });
      } finally {
        clearTimeout(timeout);
        c.req.raw.signal.removeEventListener('abort', abort);
        active.delete(key);
      }
    });
  });

  return router;
}
