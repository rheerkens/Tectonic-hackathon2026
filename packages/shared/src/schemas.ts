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
