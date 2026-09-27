import { users } from '@tectonic/db';
import type { Me } from '@tectonic/shared';
import { asc } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../app.ts';
import { serializeUser } from '../serializers.ts';

export function userRoutes(ctx: AppContext) {
  const router = new Hono<AppEnv>();

  router.get('/api/me', (c) => {
    const p = c.get('principal');
    const body: Me = {
      id: p.userId,
      name: p.name,
      email: p.email,
      color: p.color,
      createdAt: new Date(0).toISOString(),
      authSource: p.source,
    };
    return c.json(body);
  });

  router.get('/api/users', async (c) => {
    const rows = await ctx.db.select().from(users).orderBy(asc(users.name));
    return c.json(rows.map(serializeUser));
  });

  return router;
}
