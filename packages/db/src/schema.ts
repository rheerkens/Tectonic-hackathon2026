import { MEMBER_ROLES, SOURCE_KINDS, SOURCE_STATUSES, type PayslipLine, type ProjectChatToolCall } from '@tectonic/shared';
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const memberRoleEnum = pgEnum('member_role', MEMBER_ROLES);
export const sourceKindEnum = pgEnum('source_kind', SOURCE_KINDS);
export const sourceStatusEnum = pgEnum('source_status', SOURCE_STATUSES);

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

/** A team ("Payroll België", "Klantteam Atlas"). Membership is what gives access to its sources. */
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

/** One piece of knowledge (agreement, procedure, manual, chat) that can answer a question. */
export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: sourceKindEnum('kind').notNull(),
    version: integer('version'),
    topic: text('topic').notNull(),
    keywords: text('keywords').notNull().default(''),
    country: text('country').notNull(),
    client: text('client'),
    value: text('value').notNull(),
    claim: text('claim').notNull(),
    quote: text('quote').notNull().default(''),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    status: sourceStatusEnum('status').notNull().default('unconfirmed'),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    approvedById: text('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    traceable: boolean('traceable').notNull().default(true),
    /** Someone doubts this source; visible to everyone, resolved by the owner. */
    disputed: boolean('disputed').notNull().default(false),
    disputedById: text('disputed_by_id').references(() => users.id, { onDelete: 'set null' }),
    supersededBy: text('superseded_by'),
    /** Access per source: the viewer must be a member of the owning project AND of every project listed here. */
    audienceProjectIds: uuid('audience_project_ids').array().notNull().default(sql`'{}'::uuid[]`),
    ...timestamps,
  },
  (t) => [uniqueIndex('sources_code_idx').on(t.code), index('sources_project_topic_idx').on(t.projectId, t.topic)],
);

/** One monthly payslip of an employee. Readable by every member of the owning team, nobody else. Amounts are in euro cents. */
export const payslips = pgTable(
  'payslips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    employeeName: text('employee_name').notNull(),
    employeeNumber: text('employee_number').notNull(),
    /** 'YYYY-MM' */
    period: text('period').notNull(),
    country: text('country').notNull(),
    client: text('client'),
    grossCents: integer('gross_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    lines: jsonb('lines').$type<PayslipLine[]>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('payslips_employee_period_idx').on(t.projectId, t.employeeNumber, t.period)],
);

/** Each member has a private assistant conversation within a project. */
export const chatTurns = pgTable('chat_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  reply: text('reply').notNull().default(''),
  tools: jsonb('tools').$type<ProjectChatToolCall[]>().notNull().default([]),
  contextProjectIds: jsonb('context_project_ids').$type<string[]>().notNull().default([]),
  contextSourceAccessHash: text('context_source_access_hash').notNull().default(''),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('chat_turns_project_user_created_idx').on(t.projectId, t.userId, t.createdAt)]);

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type PayslipRow = typeof payslips.$inferSelect;
