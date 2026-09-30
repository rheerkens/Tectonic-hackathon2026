import { ChatInputSchema, type ChatResult } from '@tectonic/shared';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { createChatEnv } from '../chat/tools.ts';
import { runChat } from '../chat/run.ts';
import { rateLimited } from '../errors.ts';
import { createRateLimiter } from '../rate-limit.ts';
import { visibleSources } from '../sources.ts';
import { jsonBody } from '../validate.ts';

export function chatRoutes(ctx: AppContext) {
  const { db } = ctx;
  const router = new Hono<AppEnv>();
  const retryAfter = createRateLimiter();

  router.post('/api/chat', jsonBody(ChatInputSchema), async (c) => {
    const { userId } = c.get('principal');
    const wait = retryAfter(userId);
    if (wait > 0) {
      return c.json(rateLimited(`Te veel vragen. Probeer het over ${wait} seconden opnieuw.`).toBody(), 429, { 'Retry-After': String(wait) });
    }
    const input = c.req.valid('json');
    // Scoped to the caller's teams before any tool can run.
    const { teams, rows } = await visibleSources(db, userId);
    const env = createChatEnv(teams, rows, input.context);
    const result: ChatResult = runChat(env, input);
    return c.json(result);
  });

  return router;
}
