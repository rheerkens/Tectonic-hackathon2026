import { projectMembers, projects, sources, type Database } from '@tectonic/db';
import { eq, inArray } from 'drizzle-orm';

/** The teams a user belongs to. Everything the API shows is scoped to these: access is part of trust. */
export async function myTeams(db: Database, userId: string) {
  return db
    .select({ id: projects.id, name: projects.name, color: projects.color, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId));
}

/** The user's teams plus every source in them. The only way knowledge and chat code read sources. */
export async function visibleSources(db: Database, userId: string) {
  const teams = await myTeams(db, userId);
  if (teams.length === 0) return { teams, rows: [] };
  const rows = await db.select().from(sources).where(inArray(sources.projectId, teams.map((t) => t.id)));
  return { teams, rows };
}
