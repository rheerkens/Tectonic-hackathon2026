import { z } from 'zod';
import { ChatInputSchema, ChatResultSchema } from './chat.ts';
import { AccessSchema, AssessedSourceSchema, AskInputSchema, AskResultSchema, CheckInputSchema, CheckResultSchema, DisputeInputSchema, HealthSchema, MeSchema, NaiveAnswerSchema, OkSchema, SupersedeInputSchema, UserSchema } from './schemas.ts';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Extracts `{ projectId: string }` from `'/api/projects/:projectId'`. */
export type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof PathParams<Rest>]: string }
  : P extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Record<never, never>;

export interface RouteContract<
  Path extends string,
  Body extends z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny,
> {
  method: HttpMethod;
  path: Path;
  body: Body;
  response: Response;
}

function route<Path extends string, Body extends z.ZodTypeAny | undefined, Response extends z.ZodTypeAny>(
  method: HttpMethod,
  path: Path,
  spec: { body?: Body; response: Response },
): RouteContract<Path, Body, Response> {
  return { method, path, body: spec.body as Body, response: spec.response };
}

/**
 * Single source of truth for the HTTP API. The Hono server mounts these paths
 * and validates bodies with the same schemas; the web client builds requests
 * from them and parses responses with `response`.
 */
export const api = {
  health: route('GET', '/api/health', { response: HealthSchema }),
  me: route('GET', '/api/me', { response: MeSchema }),
  listUsers: route('GET', '/api/users', { response: UserSchema.array() }),

  /** The teams I belong to, the clients in the sources I may see, and example questions. */
  access: route('GET', '/api/access', { response: AccessSchema }),
  /** Every source I may see, rated for its own country and client in the current month. Feeds the knowledge map. */
  listSources: route('GET', '/api/sources', { response: AssessedSourceSchema.array() }),
  /** Answers a question from the sources the caller may see, for a country, client and period. */
  ask: route('POST', '/api/ask', { body: AskInputSchema, response: AskResultSchema }),
  /** Checks a pasted message (e.g. from Teams) against the sources: which claims hold, and what contradicts them. */
  check: route('POST', '/api/check', { body: CheckInputSchema, response: CheckResultSchema }),
  /** A plain assistant's answer: ignores country, client, period and status, shows no confidence. For the side-by-side demo. */
  naiveAnswer: route('POST', '/api/naive-answer', { body: AskInputSchema, response: NaiveAnswerSchema }),
  /** Chat with tool calling: the model looks up, rates and cites sources the caller may see. Deterministic without an LLM key. */
  chat: route('POST', '/api/chat', { body: ChatInputSchema, response: ChatResultSchema }),
  /** The source owner (or the team owner, for an ownerless source) confirms a source is approved. */
  approveSource: route('POST', '/api/sources/:sourceId/approve', { response: OkSchema }),
  /** Any editor disputes a source (`disputed: true`); only its owner (or the team owner, if ownerless) resolves it (`false`). */
  disputeSource: route('POST', '/api/sources/:sourceId/dispute', { body: DisputeInputSchema, response: OkSchema }),
  /** An editor marks a source as replaced by a newer version (same team, same topic). It stays inspectable but can no longer be the answer. */
  supersedeSource: route('POST', '/api/sources/:sourceId/supersede', { body: SupersedeInputSchema, response: OkSchema }),
} as const;

export type ApiContracts = typeof api;
export type ApiRouteName = keyof ApiContracts;

/** Fill `:param` placeholders. Values are URL-encoded. */
export function buildPath<P extends string>(path: P, params: PathParams<P>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = (params as Record<string, string>)[key];
    if (value === undefined) throw new Error(`Missing path parameter "${key}" for ${path}`);
    return encodeURIComponent(value);
  });
}
