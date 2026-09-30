import { projectMembers, users } from '@tectonic/db';
import type { Me } from '@tectonic/shared';
import { asc, eq, inArray, or } from 'drizzle-orm';
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

  /** Only people you share a team with: names and emails of other teams' members are not revealed. */
  router.get('/api/users', async (c) => {
    const me = c.get('principal').userId;
    const myTeams = ctx.db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, me));
    const teammates = ctx.db.select({ id: projectMembers.userId }).from(projectMembers).where(inArray(projectMembers.projectId, myTeams));
    const rows = await ctx.db
      .select()
      .from(users)
      .where(or(eq(users.id, me), inArray(users.id, teammates)))
      .orderBy(asc(users.name));
    return c.json(rows.map(serializeUser));
  });

  return router;
}
