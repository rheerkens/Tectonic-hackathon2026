import { DEMO_USERS, type Country, type SourceKind, type SourceStatus } from '@tectonic/shared';
import { count, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { projectMembers, projects, sources, users } from './schema.ts';

interface SeedTeam {
  key: string;
  name: string;
  description: string;
  color: string;
  ownerId: string;
  members: Array<{ userId: string; role: 'editor' | 'viewer' }>;
}

interface SeedSource {
  code: string;
  team: string;
  title: string;
  kind: SourceKind;
  version?: number;
  topic: string;
  keywords: string;
  country: Country;
  client?: string;
  value: string;
  claim: string;
  quote: string;
  validFrom: string;
  validTo?: string;
  status: SourceStatus;
  ownerId?: string;
  approvedById?: string;
  traceable?: boolean;
  supersededBy?: string;
  /** Extra teams (keys) the viewer must also belong to. */
  audience?: string[];
}

/**
 * Wanne, Roy and Sebastien are the three payroll consultants of the demo. Wanne asks the questions.
 * Sebastien is NOT in "Klantteam Atlas", so he cannot see the Atlas agreement: access is part of trust.
 */
const TEAMS: SeedTeam[] = [
  {
    key: 'be',
    name: 'Payroll België',
    description: 'Procedures en handleidingen voor payroll in België en Nederland.',
    color: '#4f46e5',
    ownerId: 'demo_roy',
    members: [
      { userId: 'demo_wanne', role: 'editor' },
      { userId: 'demo_sebastien', role: 'editor' },
    ],
  },
  {
    key: 'atlas',
    name: 'Klantteam Atlas',
    description: 'Afspraken en gesprekken met klant Atlas.',
    color: '#0ea5e9',
    ownerId: 'demo_roy',
    members: [{ userId: 'demo_wanne', role: 'editor' }],
  },
];

const LOONMUTATIES = 'loonmutaties aanleveren aanleverdatum deadline inleveren doorgeven';
const ZIEKMELDING = 'ziekmelding ziek melden afwezigheid termijn doorgeven';

const SOURCES: SeedSource[] = [
  {
    code: 'S4',
    team: 'atlas',
    title: 'Klantafspraak Atlas',
    kind: 'agreement',
    version: 2,
    topic: 'loonmutaties',
    keywords: LOONMUTATIES,
    country: 'BE',
    client: 'Atlas',
    value: '22 oktober 2026',
    claim: 'Voor Atlas geldt een goedgekeurde uitzondering op de algemene aanleverdatum van 20 oktober.',
    quote: 'Atlas mag loonmutaties aanleveren tot en met 22 oktober 2026.',
    validFrom: '2026-10-01',
    validTo: '2026-10-31',
    status: 'approved',
    ownerId: 'demo_roy',
    approvedById: 'demo_roy',
  },
  {
    code: 'S1',
    team: 'be',
    title: 'Algemene procedure België',
    kind: 'manual',
    version: 5,
    topic: 'loonmutaties',
    keywords: LOONMUTATIES,
    country: 'BE',
    value: '20 oktober',
    claim: 'Loonmutaties worden uiterlijk op 20 oktober van de maand aangeleverd.',
    quote: 'Loonmutaties moeten uiterlijk op de 20e van de maand binnen zijn.',
    validFrom: '2026-10-01',
    validTo: '2026-10-31',
    status: 'approved',
    ownerId: 'demo_sebastien',
    approvedById: 'demo_sebastien',
  },
  {
    code: 'S2',
    team: 'be',
    title: 'Oude procedure België',
    kind: 'procedure',
    version: 3,
    topic: 'loonmutaties',
    keywords: LOONMUTATIES,
    country: 'BE',
    value: '15 oktober',
    claim: 'Loonmutaties worden uiterlijk op 15 van de maand aangeleverd.',
    quote: 'Aanleveren kan tot de 15e van de maand.',
    validFrom: '2024-01-01',
    validTo: '2025-12-31',
    status: 'superseded',
    approvedById: 'demo_sebastien',
    supersededBy: 'S1',
  },
  {
    code: 'S3',
    team: 'atlas',
    title: 'Teamsgesprek',
    kind: 'chat',
    topic: 'loonmutaties',
    keywords: LOONMUTATIES,
    country: 'BE',
    client: 'Atlas',
    value: '25 oktober',
    claim: 'Volgens een bericht in het team mag Atlas tot 25 oktober aanleveren.',
    quote: 'Ik dacht dat Atlas dit keer tot de 25e mocht aanleveren?',
    validFrom: '2026-10-05',
    status: 'unconfirmed',
  },
  {
    code: 'S5',
    team: 'be',
    title: 'Procedure Nederland',
    kind: 'procedure',
    version: 2,
    topic: 'loonmutaties',
    keywords: LOONMUTATIES,
    country: 'NL',
    value: '18 oktober',
    claim: 'In Nederland worden loonmutaties uiterlijk op 18 oktober aangeleverd.',
    quote: 'Nederlandse klanten leveren loonmutaties aan tot de 18e.',
    validFrom: '2026-01-01',
    status: 'approved',
    ownerId: 'demo_sebastien',
    approvedById: 'demo_sebastien',
  },
  {
    code: 'S6',
    team: 'be',
    title: 'Procedure ziekmelding België',
    kind: 'procedure',
    version: 4,
    topic: 'ziekmelding',
    keywords: ZIEKMELDING,
    country: 'BE',
    value: 'Binnen 24 uur',
    claim: 'Een ziekmelding wordt binnen 24 uur doorgegeven aan payroll.',
    quote: 'Ziekmeldingen worden binnen 24 uur na de eerste ziektedag doorgegeven.',
    validFrom: '2026-01-01',
    status: 'approved',
    ownerId: 'demo_roy',
    approvedById: 'demo_roy',
  },
  {
    code: 'S7',
    team: 'atlas',
    title: 'Teamsgesprek ziekmelding',
    kind: 'chat',
    topic: 'ziekmelding',
    keywords: ZIEKMELDING,
    country: 'BE',
    client: 'Atlas',
    value: 'Binnen 48 uur',
    claim: 'Volgens een bericht mag Atlas ziekmeldingen binnen 48 uur doorgeven.',
    quote: 'Atlas zei dat 48 uur ook goed is voor ziekmeldingen.',
    validFrom: '2026-09-01',
    status: 'unconfirmed',
  },
  {
    // Restricted: lives in Payroll België but only people in BOTH Payroll België and Klantteam Atlas may see it.
    // Sebastien (only Payroll België) does not see it anywhere.
    code: 'S8',
    team: 'be',
    audience: ['atlas'],
    title: 'Afspraak Atlas: eindejaarspremie',
    kind: 'agreement',
    version: 1,
    topic: 'eindejaarspremie',
    keywords: 'eindejaarspremie premie uitbetalen uitbetaling december Atlas',
    country: 'BE',
    client: 'Atlas',
    value: '15 december',
    claim: 'Voor Atlas wordt de eindejaarspremie uiterlijk op 15 december uitbetaald.',
    quote: 'Atlas en SD Worx spreken af dat de eindejaarspremie uiterlijk op 15 december wordt uitbetaald.',
    validFrom: '2026-01-01',
    status: 'approved',
    ownerId: 'demo_roy',
    approvedById: 'demo_roy',
  },
];

export interface SeedResult {
  seeded: boolean;
  users: number;
  projects: number;
  sources: number;
}

/**
 * Inserts the demo users, two teams and the sources. Demo users are always upserted; teams and
 * sources only when the database has no teams yet (or when `reset` wipes them first).
 */
export async function seedDatabase(db: Database, options: { reset?: boolean } = {}): Promise<SeedResult> {
  await db
    .insert(users)
    .values(DEMO_USERS.map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color })))
    .onConflictDoUpdate({
      target: users.id,
      set: { name: sql`excluded.name`, email: sql`excluded.email`, color: sql`excluded.color` },
    });

  if (options.reset) {
    await db.delete(sources);
    await db.delete(projectMembers);
    await db.delete(projects);
  }

  const [existing] = await db.select({ n: count() }).from(projects);
  if ((existing?.n ?? 0) > 0) return { seeded: false, users: DEMO_USERS.length, projects: 0, sources: 0 };

  const teamIds = new Map<string, string>();
  for (const team of TEAMS) {
    const [row] = await db.insert(projects).values({ name: team.name, description: team.description, color: team.color, ownerId: team.ownerId }).returning();
    if (!row) throw new Error('Failed to insert seed team');
    teamIds.set(team.key, row.id);
    await db.insert(projectMembers).values([
      { projectId: row.id, userId: team.ownerId, role: 'owner' },
      ...team.members.map((m) => ({ projectId: row.id, userId: m.userId, role: m.role })),
    ]);
  }

  await db.insert(sources).values(
    SOURCES.map(({ team, ...s }) => ({
      ...s,
      projectId: teamIds.get(team)!,
      audienceProjectIds: (s.audience ?? []).map((k) => teamIds.get(k)!),
      audience: undefined,
      client: s.client ?? null,
      validTo: s.validTo ?? null,
      version: s.version ?? null,
      ownerId: s.ownerId ?? null,
      approvedById: s.approvedById ?? null,
      supersededBy: s.supersededBy ?? null,
      traceable: s.traceable ?? true,
    })),
  );

  return { seeded: true, users: DEMO_USERS.length, projects: TEAMS.length, sources: SOURCES.length };
}
