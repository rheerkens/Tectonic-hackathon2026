import { DEMO_USERS, type TaskPriority, type TaskStatus } from '@tectonic/shared';
import { count, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { projectMembers, projects, tasks, users } from './schema.ts';

/** Small deterministic PRNG (mulberry32) so seed data is identical everywhere. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedProject {
  name: string;
  description: string;
  color: string;
  ownerId: string;
  members: Array<{ userId: string; role: 'editor' | 'viewer' }>;
  tasks: Array<{ title: string; status: TaskStatus; description?: string }>;
}

const SEED_PROJECTS: SeedProject[] = [
  {
    name: 'Launch Website',
    description: 'Marketing site for the hackathon launch, from copy to deploy.',
    color: '#6366f1',
    ownerId: 'demo_ada',
    members: [
      { userId: 'demo_grace', role: 'editor' },
      { userId: 'demo_margaret', role: 'viewer' },
    ],
    tasks: [
      { title: 'Draft landing page copy', status: 'done' },
      { title: 'Design hero illustration', status: 'done' },
      { title: 'Set up analytics events', status: 'review' },
      { title: 'Build pricing section', status: 'in_progress', description: 'Three tiers, monthly/yearly toggle.' },
      { title: 'Write launch blog post', status: 'in_progress' },
      { title: 'Configure custom domain', status: 'backlog' },
      { title: 'Add newsletter signup form', status: 'backlog' },
      { title: 'Accessibility audit', status: 'backlog', description: 'Keyboard navigation, contrast, screen reader labels.' },
    ],
  },
  {
    name: 'Mobile App',
    description: 'Capacitor shell around the web app with push notifications.',
    color: '#0ea5e9',
    ownerId: 'demo_grace',
    members: [
      { userId: 'demo_ada', role: 'editor' },
      { userId: 'demo_alan', role: 'editor' },
    ],
    tasks: [
      { title: 'Generate app icons and splash screens', status: 'done' },
      { title: 'Wire up deep links', status: 'review' },
      { title: 'Implement offline banner', status: 'in_progress' },
      { title: 'Push notification permissions flow', status: 'in_progress' },
      { title: 'TestFlight build', status: 'backlog' },
      { title: 'Play Store internal track', status: 'backlog' },
      { title: 'Crash reporting integration', status: 'backlog' },
    ],
  },
  {
    name: 'Hackathon Ops',
    description: 'Everything needed to run the event smoothly.',
    color: '#f59e0b',
    ownerId: 'demo_margaret',
    members: [
      { userId: 'demo_ada', role: 'editor' },
      { userId: 'demo_grace', role: 'editor' },
    ],
    tasks: [
      { title: 'Book venue and catering', status: 'done' },
      { title: 'Confirm judges', status: 'done' },
      { title: 'Print name badges', status: 'review' },
      { title: 'Prepare demo-day schedule', status: 'in_progress' },
      { title: 'Order team t-shirts', status: 'backlog' },
      { title: 'Set up Wi-Fi credentials sheet', status: 'backlog' },
      { title: 'Write judging rubric', status: 'backlog' },
      { title: 'Arrange prize vouchers', status: 'backlog' },
      { title: 'Post-event survey', status: 'backlog' },
    ],
  },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'medium', 'high', 'urgent'];

export interface SeedResult {
  seeded: boolean;
  users: number;
  projects: number;
  tasks: number;
}

/**
 * Inserts the demo users, three projects with memberships and a spread of tasks.
 * Demo users are always upserted; projects/tasks are only inserted when the
 * database has no projects yet (or when `reset` is set, which wipes them first).
 */
export async function seedDatabase(db: Database, options: { reset?: boolean } = {}): Promise<SeedResult> {
  const random = prng(2026);

  await db
    .insert(users)
    .values(DEMO_USERS.map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color })))
    .onConflictDoUpdate({
      target: users.id,
      set: { name: sql`excluded.name`, email: sql`excluded.email`, color: sql`excluded.color` },
    });

  if (options.reset) {
    await db.delete(tasks);
    await db.delete(projectMembers);
    await db.delete(projects);
  }

  const [existing] = await db.select({ n: count() }).from(projects);
  if ((existing?.n ?? 0) > 0) {
    return { seeded: false, users: DEMO_USERS.length, projects: 0, tasks: 0 };
  }

  let taskTotal = 0;
  const base = Date.parse('2026-09-01T09:00:00Z');
  for (const [projectIndex, seed] of SEED_PROJECTS.entries()) {
    const createdAt = new Date(base + projectIndex * 3_600_000);
    const [project] = await db
      .insert(projects)
      .values({
        name: seed.name,
        description: seed.description,
        color: seed.color,
        ownerId: seed.ownerId,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    if (!project) throw new Error('Failed to insert seed project');

    await db.insert(projectMembers).values([
      { projectId: project.id, userId: seed.ownerId, role: 'owner' },
      ...seed.members.map((m) => ({ projectId: project.id, userId: m.userId, role: m.role })),
    ]);

    const memberIds = [seed.ownerId, ...seed.members.map((m) => m.userId)];
    const rows = seed.tasks.map((t, i) => {
      const assignee = random() < 0.75 ? memberIds[Math.floor(random() * memberIds.length)]! : null;
      const priority = PRIORITIES[Math.floor(random() * PRIORITIES.length)]!;
      const when = new Date(createdAt.getTime() + (i + 1) * 900_000);
      return {
        projectId: project.id,
        title: t.title,
        description: t.description ?? '',
        status: t.status,
        priority,
        assigneeId: assignee,
        position: (i + 1) * 1000,
        createdById: seed.ownerId,
        createdAt: when,
        updatedAt: when,
      };
    });
    await db.insert(tasks).values(rows);
    taskTotal += rows.length;
  }

  return { seeded: true, users: DEMO_USERS.length, projects: SEED_PROJECTS.length, tasks: taskTotal };
}
