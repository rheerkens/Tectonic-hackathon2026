import { z } from 'zod';
import { AuthSourceSchema, ProjectSchema, TaskSchema } from './schemas.ts';

export const WS_PATH = '/ws';

/** Messages the browser sends. The first message must be `auth`. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().optional(), devUser: z.string().optional() }),
  z.object({ type: z.literal('subscribe'), projectId: z.uuid() }),
  z.object({ type: z.literal('unsubscribe'), projectId: z.uuid() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Domain events, always published *after* the change was persisted. */
export const RealtimeEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task.created'), task: TaskSchema }),
  z.object({ kind: z.literal('task.updated'), task: TaskSchema }),
  z.object({ kind: z.literal('task.deleted'), taskId: z.uuid() }),
  z.object({ kind: z.literal('project.updated'), project: ProjectSchema }),
  z.object({ kind: z.literal('project.deleted') }),
  z.object({ kind: z.literal('members.changed') }),
  z.object({ kind: z.literal('sources.changed') }),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;

export const PresenceUserSchema = z.object({
  userId: z.string(),
  name: z.string(),
  color: z.string(),
  connections: z.number().int(),
});
export type PresenceUser = z.infer<typeof PresenceUserSchema>;

export const RealtimeErrorCodeSchema = z.enum([
  'unauthorized',
  'forbidden',
  'not_found',
  'bad_message',
  'auth_timeout',
]);

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    userId: z.string(),
    name: z.string(),
    authSource: AuthSourceSchema,
    serverTime: z.string(),
  }),
  z.object({ type: z.literal('subscribed'), projectId: z.uuid() }),
  z.object({ type: z.literal('unsubscribed'), projectId: z.uuid() }),
  z.object({
    type: z.literal('event'),
    projectId: z.uuid(),
    seq: z.number().int(),
    actorId: z.string().nullable(),
    event: RealtimeEventSchema,
  }),
  z.object({ type: z.literal('presence'), projectId: z.uuid(), users: PresenceUserSchema.array() }),
  z.object({ type: z.literal('pong') }),
  z.object({
    type: z.literal('error'),
    code: RealtimeErrorCodeSchema,
    message: z.string(),
    projectId: z.string().optional(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function projectTopic(projectId: string): string {
  return `project:${projectId}`;
}
