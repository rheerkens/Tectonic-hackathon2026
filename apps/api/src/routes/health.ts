import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import type { Health } from '@tectonic/shared';

export function healthRoutes(ctx: AppContext) {
  const router = new Hono<AppEnv>();

  router.get('/api/health', async (c) => {
    let database: Health['database'] = 'ok';
    try {
      await ctx.db.execute(sql`select 1`);
    } catch (error) {
      database = 'error';
      ctx.log.warn('health: database check failed', { message: error instanceof Error ? error.message : String(error) });
    }
    const body: Health = {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: ctx.config.version,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      database,
      authMode: ctx.config.authMode,
      timestamp: new Date().toISOString(),
    };
    return c.json(body, database === 'ok' ? 200 : 503);
  });

  return router;
}
