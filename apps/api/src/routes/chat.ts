import { ChatInputSchema, type ChatResult } from '@tectonic/shared';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { createChatEnv } from '../chat/tools.ts';
import { runChat } from '../chat/run.ts';
import { DEFAULT_LLM_TIMEOUT_MS } from '../config.ts';
import { rateLimited } from '../errors.ts';
import { visibleSources } from '../sources.ts';
import { jsonBody } from '../validate.ts';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/** Sliding window per user, in memory (one API process). Returns seconds to wait, or 0 when the request may proceed. */
function createRateLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (userId: string): number => {
    const t = now();
    const recent = (hits.get(userId) ?? []).filter((h) => t - h < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      hits.set(userId, recent);
      return Math.max(1, Math.ceil((recent[0]! + WINDOW_MS - t) / 1000));
    }
    recent.push(t);
    hits.set(userId, recent);
    return 0;
  };
}

export function chatRoutes(ctx: AppContext) {
  const { db, llm, log, config } = ctx;
  const router = new Hono<AppEnv>();
  const retryAfter = createRateLimiter();

  router.post('/api/chat', jsonBody(ChatInputSchema), async (c) => {
    const { userId } = c.get('principal');
    const wait = retryAfter(userId);
    if (wait > 0) {
      return c.json(rateLimited(`Te veel vragen. Probeer het over ${wait} seconden opnieuw.`).toBody(), 429, { 'Retry-After': String(wait) });
    }
    const input = c.req.valid('json');
    // Scoped to the caller's teams before any tool can run: the model never sees what the user may not.
    const { teams, rows } = await visibleSources(db, userId);
    const env = createChatEnv(teams, rows, input.context);
    const result: ChatResult = await runChat({ llm, log, timeoutMs: config.llm?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS }, env, input);
    return c.json(result);
  });

  return router;
}
