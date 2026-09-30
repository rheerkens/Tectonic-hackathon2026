import { z } from 'zod';
import { AnswerStatusSchema, AskResultSchema, AssessedSourceSchema, CountrySchema } from './schemas.ts';

/**
 * Chat with tool calling (U1 #20 / U2 #21 / U3 #22). The server runs the tools deterministically
 * against the caller's visible sources only, and returns a templated answer plus a trace of each
 * tool call (`mode: 'fallback'`).
 */

// ---- tools -----------------------------------------------------------------
export const CHAT_TOOL_NAMES = ['find_knowledge', 'assess_trust', 'get_source'] as const;
export const ChatToolNameSchema = z.enum(CHAT_TOOL_NAMES);
export type ChatToolName = z.infer<typeof ChatToolNameSchema>;

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

/** Which sources are about this question? Returns the matched topic and the sources on it (code, title, country, client, status). */
export const FindKnowledgeArgsSchema = z.object({ query: z.string().trim().min(2).max(300) });
export type FindKnowledgeArgs = z.infer<typeof FindKnowledgeArgsSchema>;

/** Rates every source on the question's topic for a country/client/period: best answer, verdict per source, onderbouwing checks. Omitted fields fall back to the chat context. */
export const AssessTrustArgsSchema = z.object({
  question: z.string().trim().min(3).max(300),
  country: CountrySchema.optional(),
  client: z.string().trim().max(80).nullable().optional(),
  period: period.optional(),
});
export type AssessTrustArgs = z.infer<typeof AssessTrustArgsSchema>;

/** The full source behind a code (S1, S2, ...): quote, owner, validity, status. Only sources the caller may see. */
export const GetSourceArgsSchema = z.object({ code: z.string().trim().min(1).max(20) });
export type GetSourceArgs = z.infer<typeof GetSourceArgsSchema>;

export const CHAT_TOOL_ARGS = {
  find_knowledge: FindKnowledgeArgsSchema,
  assess_trust: AssessTrustArgsSchema,
  get_source: GetSourceArgsSchema,
} as const satisfies Record<ChatToolName, z.ZodTypeAny>;

/** One executed tool call, for the "tool progress" trace in the chat UI. */
export const ChatToolCallSchema = z.object({
  id: z.string(),
  name: ChatToolNameSchema,
  /** The validated arguments (or the raw ones when validation failed). */
  args: z.record(z.string(), z.unknown()),
  status: z.enum(['ok', 'error']),
  /** One Dutch line for the UI, e.g. "Zocht kennis over 'dertiende maand': 3 bronnen (S1, S2, S7)". */
  summary: z.string(),
  /** Source codes this call returned or touched. */
  sourceCodes: z.string().array(),
  error: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
});
export type ChatToolCall = z.infer<typeof ChatToolCallSchema>;

// ---- request ---------------------------------------------------------------
export const ChatContextSchema = z.object({
  country: CountrySchema,
  client: z.string().trim().max(80).nullable(),
  period,
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const ChatInputSchema = z.object({
  /** Conversation so far, oldest first; the last turn is the user's new question. */
  messages: ChatTurnSchema.array()
    .min(1)
    .max(20)
    .refine((m) => m.at(-1)?.role === 'user', 'The last message must be from the user'),
  context: ChatContextSchema,
});
export type ChatInput = z.input<typeof ChatInputSchema>;

// ---- response --------------------------------------------------------------
export const ChatResultSchema = z.object({
  /** The assistant's answer in Dutch. Plain text with light markdown (**bold**, lists); cites sources inline as [S1]. */
  answer: z.string(),
  /** How well the answer is backed, from the trust assessment it rests on ('geen' = abstained / knowledge gap). */
  status: AnswerStatusSchema,
  statusLabel: z.string(),
  /** The context the answer was rated for: the chat context, unless the question itself asked for another country, client or period. */
  context: ChatContextSchema,
  /** Always 'fallback': deterministic tools and a templated answer, no model. 'llm' is kept for contract compatibility and is never returned. */
  mode: z.enum(['llm', 'fallback']),
  toolCalls: ChatToolCallSchema.array(),
  /** Sources cited in the answer, in citation order. */
  citations: AssessedSourceSchema.array(),
  /** The last trust assessment the answer rests on: best source plus the rejected ones and why (other country, superseded, ...). */
  assessment: AskResultSchema.nullable(),
});
export type ChatResult = z.infer<typeof ChatResultSchema>;
