import { DEMO_USERS, type SourceCountry, type SourceKind, type TaskPriority, type TaskStatus } from '@tectonic/shared';
import { count, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { knowledgeSources, projectMembers, projects, tasks, users } from './schema.ts';

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

interface SeedSource {
  title: string;
  kind: SourceKind;
  topic: string;
  country: SourceCountry;
  claim: string;
  content: string;
  ownerId: string | null;
  verifiedById?: string;
  /** Days since the source was last reviewed, relative to seeding time. */
  reviewedDaysAgo: number;
  flaggedOutdated?: boolean;
}

/**
 * The persona: Ada just inherited the Vandeputte Logistics payroll portfolio. Grace is the Belgian payroll
 * expert, Margaret covers the Netherlands, Alan is compliance. The corpus is synthetic, and deliberately
 * messy: contradicting, outdated and ownerless sources are the point.
 */
const SEED_PORTFOLIO = {
  name: 'Vandeputte Logistics',
  description: 'Inherited payroll portfolio (BE + NL). Synthetic demo data, not legal advice.',
  color: '#1a73e8',
  ownerId: 'demo_ada',
  members: [
    { userId: 'demo_grace', role: 'editor' as const },
    { userId: 'demo_margaret', role: 'editor' as const },
    { userId: 'demo_alan', role: 'editor' as const },
  ],
};

const SEED_SOURCES: SeedSource[] = [
  // 13th month: a solid policy, an outdated wiki page and a Teams chat that disagree (Belgium)
  {
    title: 'BE payroll policy: year-end bonus',
    kind: 'policy',
    topic: '13th-month',
    country: 'BE',
    claim: 'Paid in December, pro rata to months worked',
    content: 'Belgium has no statutory 13th month. Vandeputte pays a year-end bonus via the sector agreement, in the December payroll, pro rata to months worked.',
    ownerId: 'demo_grace',
    verifiedById: 'demo_grace',
    reviewedDaysAgo: 30,
  },
  {
    title: 'Payroll wiki: 13th month',
    kind: 'wiki',
    topic: '13th-month',
    country: 'ALL',
    claim: 'Paid in November, in full',
    content: 'The 13th month is paid in the November payroll, in full, to all employees.',
    ownerId: null,
    reviewedDaysAgo: 420,
  },
  {
    title: 'Teams: client call notes on the 13th month',
    kind: 'teams_chat',
    topic: '13th-month',
    country: 'BE',
    claim: 'Paid in December, only after 6 months seniority',
    content: 'Client said the 13th month goes out with the December payroll, but only for people with more than 6 months seniority.',
    ownerId: 'demo_alan',
    reviewedDaysAgo: 20,
  },
  {
    title: 'NL payroll policy: 13th month',
    kind: 'policy',
    topic: '13th-month',
    country: 'NL',
    claim: 'Paid in December, pro rata to months worked',
    content: 'In the Netherlands the 13th month (dertiende maand) is contractual. It is paid in December, pro rata to months worked. Holiday allowance is separate.',
    ownerId: 'demo_margaret',
    verifiedById: 'demo_margaret',
    reviewedDaysAgo: 45,
  },
  // Notice period: manual vs an old email
  {
    title: 'BE manual: notice periods',
    kind: 'manual',
    topic: 'notice-period',
    country: 'BE',
    claim: 'Notice follows the seniority table of the 2014 unified statute',
    content: 'For dismissal in Belgium the notice period is taken from the seniority table of the unified statute (2014), for blue and white collar alike.',
    ownerId: 'demo_alan',
    verifiedById: 'demo_alan',
    reviewedDaysAgo: 60,
  },
  {
    title: 'Email: notice period rules (2012)',
    kind: 'email',
    topic: 'notice-period',
    country: 'BE',
    claim: 'Blue and white collar workers have separate notice rules',
    content: 'Forwarded email from a former colleague explaining the separate notice rules for blue and white collar workers.',
    ownerId: null,
    reviewedDaysAgo: 900,
  },
  // Meal vouchers: a knowledge gap, one ownerless chat
  {
    title: 'Teams: meal voucher amount',
    kind: 'teams_chat',
    topic: 'meal-vouchers',
    country: 'BE',
    claim: 'Meal vouchers are 8 euro per worked day',
    content: 'Someone mentioned in the payroll channel that Vandeputte meal vouchers are 8 euro per worked day.',
    ownerId: null,
    reviewedDaysAgo: 120,
  },
  // Sick pay: two markets, both solid
  {
    title: 'BE manual: guaranteed salary',
    kind: 'manual',
    topic: 'sick-pay',
    country: 'BE',
    claim: 'Employer pays guaranteed salary for the first 30 days',
    content: 'For employees the employer continues the salary for the first 30 days of illness, after which the health insurer takes over.',
    ownerId: 'demo_grace',
    verifiedById: 'demo_grace',
    reviewedDaysAgo: 90,
  },
  {
    title: 'NL policy: sick pay',
    kind: 'policy',
    topic: 'sick-pay',
    country: 'NL',
    claim: 'Employer pays at least 70% of salary for up to 104 weeks',
    content: 'In the Netherlands the employer pays at least 70% of the salary for up to 104 weeks of illness.',
    ownerId: 'demo_margaret',
    verifiedById: 'demo_margaret',
    reviewedDaysAgo: 40,
  },
  // Handover: corroborated, high trust
  {
    title: 'Portfolio handover checklist',
    kind: 'policy',
    topic: 'handover',
    country: 'ALL',
    claim: 'A handover needs a signed mandate, the last 3 payroll runs and the open-issues log',
    content: 'When a payroll portfolio changes consultant, the handover needs a signed mandate, the last 3 payroll runs and the open-issues log.',
    ownerId: 'demo_ada',
    verifiedById: 'demo_grace',
    reviewedDaysAgo: 14,
  },
  {
    title: 'Expert note: what a good handover looks like',
    kind: 'expert_note',
    topic: 'handover',
    country: 'ALL',
    claim: 'A handover needs a signed mandate, the last 3 payroll runs and the open-issues log',
    content: 'Grace: never accept a portfolio without the signed mandate, the last 3 payroll runs and the open-issues log.',
    ownerId: 'demo_grace',
    reviewedDaysAgo: 25,
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
    await db.delete(knowledgeSources);
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

  // Created before the demo projects so it is the one people land on.
  const { members: portfolioMembers, ...portfolioRow } = SEED_PORTFOLIO;
  const portfolioAt = new Date(base - 3_600_000);
  const [portfolio] = await db.insert(projects).values({ ...portfolioRow, createdAt: portfolioAt, updatedAt: portfolioAt }).returning();
  if (!portfolio) throw new Error('Failed to insert seed portfolio');
  await db.insert(projectMembers).values([
    { projectId: portfolio.id, userId: SEED_PORTFOLIO.ownerId, role: 'owner' },
    ...portfolioMembers.map((m) => ({ projectId: portfolio.id, userId: m.userId, role: m.role })),
  ]);
  const now = Date.now();
  await db.insert(knowledgeSources).values(
    SEED_SOURCES.map(({ reviewedDaysAgo, ...s }) => ({
      ...s,
      projectId: portfolio.id,
      verifiedById: s.verifiedById ?? null,
      reviewedAt: new Date(now - reviewedDaysAgo * 86_400_000),
    })),
  );

  return { seeded: true, users: DEMO_USERS.length, projects: SEED_PROJECTS.length, tasks: taskTotal };
}
