import { projectMembers, projects, tasks, users } from '@tectonic/db';
import {
  AddMemberInputSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  sortTasks,
  type ProjectDetail,
  type ProjectSummary,
} from '@tectonic/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { requireProjectAccess } from '../permissions.ts';
import { serializeMember, serializeProject, serializeTask } from '../serializers.ts';
import { jsonBody } from '../validate.ts';

const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f97316', '#14b8a6'];

export function projectRoutes(ctx: AppContext) {
  const { db, realtime } = ctx;
  const router = new Hono<AppEnv>();

  router.get('/api/projects', async (c) => {
    const userId = c.get('principal').userId;
    const memberships = await db
      .select({ projectId: projectMembers.projectId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    if (memberships.length === 0) return c.json([] satisfies ProjectSummary[]);

    const ids = memberships.map((m) => m.projectId);
    const [rows, taskCounts, memberCounts] = await Promise.all([
      db.select().from(projects).where(inArray(projects.id, ids)).orderBy(asc(projects.createdAt)),
      db
        .select({
          projectId: tasks.projectId,
          total: count(),
          done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
        })
        .from(tasks)
        .where(inArray(tasks.projectId, ids))
        .groupBy(tasks.projectId),
      db
        .select({ projectId: projectMembers.projectId, total: count() })
        .from(projectMembers)
        .where(inArray(projectMembers.projectId, ids))
        .groupBy(projectMembers.projectId),
    ]);
    const roleById = new Map(memberships.map((m) => [m.projectId, m.role]));
    const taskById = new Map(taskCounts.map((t) => [t.projectId, t]));
    const memberById = new Map(memberCounts.map((m) => [m.projectId, m.total]));

    const body: ProjectSummary[] = rows.map((row) => ({
      ...serializeProject(row),
      role: roleById.get(row.id)!,
      taskCount: taskById.get(row.id)?.total ?? 0,
      doneCount: taskById.get(row.id)?.done ?? 0,
      memberCount: memberById.get(row.id) ?? 0,
    }));
    return c.json(body);
  });

  router.post('/api/projects', jsonBody(CreateProjectInputSchema), async (c) => {
    const principal = c.get('principal');
    const input = c.req.valid('json');
    const [countRow] = await db.select({ n: count() }).from(projects);
    const color = input.color ?? PROJECT_COLORS[(countRow?.n ?? 0) % PROJECT_COLORS.length]!;

    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ name: input.name, description: input.description, color, ownerId: principal.userId })
        .returning();
      if (!project) throw new Error('insert failed');
      await tx.insert(projectMembers).values({ projectId: project.id, userId: principal.userId, role: 'owner' });
      return project;
    });

    const body: ProjectSummary = { ...serializeProject(created), role: 'owner', taskCount: 0, doneCount: 0, memberCount: 1 };
    return c.json(body, 201);
  });

  router.get('/api/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    const { project, role } = await requireProjectAccess(db, projectId, c.get('principal').userId, 'viewer');
    const [memberRows, taskRows] = await Promise.all([
      db
        .select({ member: projectMembers, user: users })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(asc(users.name)),
      db.select().from(tasks).where(eq(tasks.projectId, projectId)),
    ]);
    const body: ProjectDetail = {
      ...serializeProject(project),
      role,
      members: memberRows.map((r) => serializeMember(r.member, r.user)),
      tasks: sortTasks(taskRows.map(serializeTask)),
    };
    return c.json(body);
  });

  router.patch('/api/projects/:projectId', jsonBody(UpdateProjectInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'editor');
    const input = c.req.valid('json');
    const [updated] = await db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    if (!updated) throw notFound('Project');
    const body = serializeProject(updated);
    realtime.publish(projectId, { kind: 'project.updated', project: body }, principal.userId);
    return c.json(body);
  });

  router.delete('/api/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'owner');
    await db.delete(projects).where(eq(projects.id, projectId));
    realtime.publish(projectId, { kind: 'project.deleted' }, principal.userId);
    await realtime.revalidateSubscribers(projectId);
    return c.json({ ok: true as const });
  });

  router.post('/api/projects/:projectId/members', jsonBody(AddMemberInputSchema), async (c) => {
    const projectId = c.req.param('projectId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'owner');
    const input = c.req.valid('json');
    const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw badRequest(`Unknown user "${input.userId}"`);
    const [member] = await db
      .insert(projectMembers)
      .values({ projectId, userId: input.userId, role: input.role })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: input.role } })
      .returning();
    if (!member) throw new Error('upsert failed');
    realtime.publish(projectId, { kind: 'members.changed' }, principal.userId);
    await realtime.revalidateSubscribers(projectId);
    return c.json(serializeMember(member, user), 201);
  });

  router.delete('/api/projects/:projectId/members/:userId', async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');
    const principal = c.get('principal');
    await requireProjectAccess(db, projectId, principal.userId, 'owner');
    const owners = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
    if (owners.length === 1 && owners[0]!.userId === userId) throw conflict('A project must keep at least one owner');
    const removed = await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    if (removed.length === 0) throw notFound('Member');
    realtime.publish(projectId, { kind: 'members.changed' }, principal.userId);
    await realtime.revalidateSubscribers(projectId);
    return c.json({ ok: true as const });
  });

  return router;
}
