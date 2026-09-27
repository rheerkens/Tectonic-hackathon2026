import { MEMBER_ROLES, TASK_PRIORITIES, TASK_STATUSES } from '@tectonic/shared';
import { doublePrecision, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);
export const memberRoleEnum = pgEnum('member_role', MEMBER_ROLES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Users are keyed by their auth subject: a Clerk user id or a `demo_*` id. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  color: text('color').notNull().default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#6366f1'),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_members_user_idx').on(t.userId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: taskStatusEnum('status').notNull().default('backlog'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    position: doublePrecision('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdById: text('created_by_id')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index('tasks_project_status_position_idx').on(t.projectId, t.status, t.position)],
);

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
