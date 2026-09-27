import { tasks } from '@tectonic/db';
import { CreateTaskInputSchema, UpdateTaskInputSchema } from '@tectonic/shared';
import { and, eq, max, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { notFound } from '../errors.ts';
import { requireProjectAccess } from '../permissions.ts';
import { serializeTask } from '../serializers.ts';
import { jsonBody } from '../validate.ts';

const POSITION_STEP = 1000;

export function taskRoutes(ctx: AppContext) {
  const { db, realtime } = ctx;
  const router = new Hono<AppEnv>();

  async function nextPosition(projectId: string, status: string): Promise<number> {
    const [row] = await db
      .select({ maxPosition: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status as typeof tasks.status.enumValues[number])));
    return (row?.maxPosition ?? 0) + POSITION_STEP;
  }

  router.post('/api/projects/:projectId/tasks', jsonBody(CreateTaskInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const input = c.req.valid('json');
    const [created] = await db
      .insert(tasks)
      .values({
        projectId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        position: await nextPosition(projectId, input.status),
        createdById: principal.userId,
      })
      .returning();
    if (!created) throw new Error('insert failed');
    const body = serializeTask(created);
    // Persisted above; only now do subscribers hear about it.
    realtime.publish(projectId, { kind: 'task.created', task: body }, principal.userId);
    return c.json(body, 201);
  });

  router.patch('/api/projects/:projectId/tasks/:taskId', jsonBody(UpdateTaskInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const taskId = c.req.param('taskId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const input = c.req.valid('json');

    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
      .limit(1);
    if (!existing) throw notFound('Task');

    const statusChanged = input.status !== undefined && input.status !== existing.status;
    const position = input.position ?? (statusChanged ? await nextPosition(projectId, input.status!) : undefined);

    const [updated] = await db
      .update(tasks)
      .set({
        ...input,
        ...(position !== undefined ? { position } : {}),
        version: sql`${tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
      .returning();
    if (!updated) throw notFound('Task');
    const body = serializeTask(updated);
    realtime.publish(projectId, { kind: 'task.updated', task: body }, principal.userId);
    return c.json(body);
  });

  router.delete('/api/projects/:projectId/tasks/:taskId', async (c) => {
    const projectId = c.req.param('projectId');
    const taskId = c.req.param('taskId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const removed = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
      .returning({ id: tasks.id });
    if (removed.length === 0) throw notFound('Task');
    realtime.publish(projectId, { kind: 'task.deleted', taskId }, principal.userId);
    return c.json({ ok: true as const });
  });

  return router;
}
