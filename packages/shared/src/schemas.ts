import { z } from 'zod';

// ---- enums -----------------------------------------------------------------
export const TASK_STATUSES = ['backlog', 'in_progress', 'review', 'done'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
};

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const MEMBER_ROLES = ['viewer', 'editor', 'owner'] as const;
export const MemberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const AUTH_SOURCES = ['dev-bypass', 'clerk'] as const;
export const AuthSourceSchema = z.enum(AUTH_SOURCES);
export type AuthSource = z.infer<typeof AuthSourceSchema>;

// ---- entities --------------------------------------------------------------
const isoDate = z.string();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  color: z.string(),
  createdAt: isoDate,
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  ownerId: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.string(),
  role: MemberRoleSchema,
  user: UserSchema,
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const TaskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assigneeId: z.string().nullable(),
  position: z.number(),
  version: z.number().int(),
  createdById: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Task = z.infer<typeof TaskSchema>;

export const ProjectSummarySchema = ProjectSchema.extend({
  role: MemberRoleSchema,
  taskCount: z.number().int(),
  doneCount: z.number().int(),
  memberCount: z.number().int(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectDetailSchema = ProjectSchema.extend({
  role: MemberRoleSchema,
  members: ProjectMemberSchema.array(),
  tasks: TaskSchema.array(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const MeSchema = UserSchema.extend({ authSource: AuthSourceSchema });
export type Me = z.infer<typeof MeSchema>;

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  database: z.enum(['ok', 'error']),
  authMode: AuthSourceSchema,
  timestamp: isoDate,
});
export type Health = z.infer<typeof HealthSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

// ---- inputs ----------------------------------------------------------------
export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(500).default(''),
  color: hexColor.optional(),
});
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    color: hexColor,
  })
  .partial();
export type UpdateProjectInput = z.input<typeof UpdateProjectInputSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(4000).default(''),
  status: TaskStatusSchema.default('backlog'),
  priority: TaskPrioritySchema.default('medium'),
  assigneeId: z.string().nullable().optional(),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(4000),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    assigneeId: z.string().nullable(),
    position: z.number().finite(),
  })
  .partial();
export type UpdateTaskInput = z.input<typeof UpdateTaskInputSchema>;

export const AddMemberInputSchema = z.object({
  userId: z.string().min(1),
  role: MemberRoleSchema.default('editor'),
});
export type AddMemberInput = z.input<typeof AddMemberInputSchema>;

/** Role hierarchy helper shared by the API and the UI. */
const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 };
export function roleAtLeast(role: MemberRole | null | undefined, required: MemberRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Sort tasks the way the board renders them. */
export function sortTasks<T extends { position: number; createdAt: string }>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}


// ---- trust lens: knowledge sources -----------------------------------------
export const SOURCE_KINDS = ['policy', 'manual', 'expert_note', 'wiki', 'email', 'teams_chat'] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKindSchema>;
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  policy: 'Policy',
  manual: 'Manual',
  expert_note: 'Expert note',
  wiki: 'Wiki page',
  email: 'Email',
  teams_chat: 'Teams chat',
};

/** Markets a question can be asked about. */
export const COUNTRIES = ['BE', 'NL'] as const;
export const CountrySchema = z.enum(COUNTRIES);
export type Country = z.infer<typeof CountrySchema>;
export const SourceCountrySchema = z.enum([...COUNTRIES, 'ALL']);
export type SourceCountry = z.infer<typeof SourceCountrySchema>;

export const SourceSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  kind: SourceKindSchema,
  topic: z.string(),
  country: SourceCountrySchema,
  /** The one-sentence answer this source gives. Sources on one topic that disagree here are in conflict. */
  claim: z.string(),
  content: z.string(),
  ownerId: z.string().nullable(),
  verifiedById: z.string().nullable(),
  flaggedOutdated: z.boolean(),
  reviewedAt: isoDate,
  createdAt: isoDate,
});
export type Source = z.infer<typeof SourceSchema>;

export const TRUST_FACTOR_KEYS = ['freshness', 'ownership', 'authority', 'applicability'] as const;
export const TrustFactorSchema = z.object({
  key: z.enum(TRUST_FACTOR_KEYS),
  label: z.string(),
  /** 0..1 */
  value: z.number(),
  /** Share of the total score. */
  weight: z.number(),
  note: z.string(),
});
export type TrustFactor = z.infer<typeof TrustFactorSchema>;

export const TrustLevelSchema = z.enum(['high', 'medium', 'low']);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const TrustSchema = z.object({ score: z.number().int(), level: TrustLevelSchema, factors: TrustFactorSchema.array() });
export type Trust = z.infer<typeof TrustSchema>;

export const SourceWithTrustSchema = SourceSchema.extend({ trust: TrustSchema });
export type SourceWithTrust = z.infer<typeof SourceWithTrustSchema>;

export const ReasonSchema = z.object({ tone: z.enum(['good', 'warn', 'bad']), text: z.string() });
export type Reason = z.infer<typeof ReasonSchema>;

export const ExpertSchema = z.object({ userId: z.string(), reason: z.string() });
export type Expert = z.infer<typeof ExpertSchema>;

export const AskResultSchema = z.object({
  topic: z.string().nullable(),
  /** The claim of the most trustworthy applicable source, or null when there is a gap. */
  answer: z.string().nullable(),
  confidence: z.number().int(),
  level: TrustLevelSchema,
  reasons: ReasonSchema.array(),
  best: SourceWithTrustSchema.nullable(),
  /** Applicable sources that give a different answer than `best`. */
  conflicts: SourceWithTrustSchema.array(),
  /** Sources on the topic written for another market. */
  inapplicable: SourceWithTrustSchema.array(),
  /** Every applicable source, most trusted first. */
  sources: SourceWithTrustSchema.array(),
  experts: ExpertSchema.array(),
});
export type AskResult = z.infer<typeof AskResultSchema>;

export const KnowledgeIssueSchema = z.object({
  type: z.enum(['outdated', 'ownerless', 'conflict']),
  topic: z.string(),
  sourceIds: z.uuid().array(),
  text: z.string(),
});
export type KnowledgeIssue = z.infer<typeof KnowledgeIssueSchema>;

export const SourcesOverviewSchema = z.object({ sources: SourceWithTrustSchema.array(), issues: KnowledgeIssueSchema.array() });
export type SourcesOverview = z.infer<typeof SourcesOverviewSchema>;

export const AskInputSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(300),
  country: CountrySchema,
});
export type AskInput = z.input<typeof AskInputSchema>;

export const CreateSourceInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: SourceKindSchema,
  topic: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Use a short slug like "13th-month"'),
  country: SourceCountrySchema,
  claim: z.string().trim().min(1).max(300),
  content: z.string().trim().max(4000).default(''),
});
export type CreateSourceInput = z.input<typeof CreateSourceInputSchema>;

export const FlagSourceInputSchema = z.object({ flagged: z.boolean() });
export type FlagSourceInput = z.input<typeof FlagSourceInputSchema>;
