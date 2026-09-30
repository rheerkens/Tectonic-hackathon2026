import { z } from 'zod';

export const DEFAULT_PROJECT_CHAT_MODEL = 'gpt-6-luna';
export const CHAT_MAX_REPLY = 64_000;
export const CHAT_MAX_TOOLS = 16;
export const CHAT_MAX_TOOL_RESULT = 16_000;

export const PROJECT_CHAT_TOOL_NAMES = ['list_teams', 'list_sources', 'list_payslips'] as const;
// The server registry controls execution. New connectors need no client schema change.
export const ProjectChatToolNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export type ProjectChatToolName = z.infer<typeof ProjectChatToolNameSchema>;
export const ProjectChatToolCallSchema = z.object({
  id: z.string().max(256),
  name: ProjectChatToolNameSchema,
  status: z.enum(['running', 'completed', 'failed']),
  result: z.string().max(CHAT_MAX_TOOL_RESULT).optional(),
});
export type ProjectChatToolCall = z.infer<typeof ProjectChatToolCallSchema>;

export const ProjectChatTurnSchema = z.object({
  id: z.uuid(),
  message: z.string().max(8000),
  reply: z.string().max(CHAT_MAX_REPLY),
  tools: ProjectChatToolCallSchema.array().max(CHAT_MAX_TOOLS),
  status: z.enum(['completed', 'failed', 'cancelled']),
  createdAt: z.iso.datetime(),
});
export type ProjectChatTurn = z.infer<typeof ProjectChatTurnSchema>;

export const ProjectChatInputSchema = z.object({ message: z.string().trim().min(1).max(8000) }).strict();
export const ChatStatusSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), model: z.string() }),
  z.object({ available: z.literal(false), message: z.string() }),
]);
export type ChatStatus = z.infer<typeof ChatStatusSchema>;

export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(CHAT_MAX_REPLY) }),
  z.object({ type: z.literal('tool'), tool: ProjectChatToolCallSchema }),
  z.object({ type: z.literal('done'), turn: ProjectChatTurnSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

// POST returns newline-delimited ChatEvent JSON instead of one JSON response.
export const CHAT_STREAM_PATH = '/api/projects/:projectId/chat';

export const PayslipLineSchema = z.object({ label: z.string(), kind: z.enum(['earning', 'deduction']), amountCents: z.number().int() });
export type PayslipLine = z.infer<typeof PayslipLineSchema>;
