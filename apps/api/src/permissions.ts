import { projectMembers, projects, type Database, type ProjectRow, type SourceRow } from '@tectonic/db';
import { roleAtLeast, type MemberRole } from '@tectonic/shared';
import { and, eq } from 'drizzle-orm';
import { forbidden, notFound } from './errors.ts';

export async function getProjectRole(db: Database, projectId: string, userId: string): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export interface ProjectAccess {
  project: ProjectRow;
  role: MemberRole;
}

const ROLE_ACTION: Record<MemberRole, string> = {
  viewer: 'view',
  editor: 'edit',
  owner: 'manage',
};

/**
 * Loads the project and asserts the caller holds at least `required` role.
 * 404 when the project does not exist, 403 when the caller is not permitted.
 */
export async function requireProjectAccess(
  db: Database,
  projectId: string,
  userId: string,
  required: MemberRole,
): Promise<ProjectAccess> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw notFound('Project');
  const role = await getProjectRole(db, projectId, userId);
  if (!role) throw forbidden('You are not a member of this project');
  if (!roleAtLeast(role, required)) {
    throw forbidden(`Your role (${role}) cannot ${ROLE_ACTION[required]} this project`);
  }
  return { project, role };
}

/** Source-level access: member of the owning team AND of every extra team in the source's audience. */
export function canSeeSource(source: Pick<SourceRow, 'projectId' | 'audienceProjectIds'>, memberOf: ReadonlySet<string>): boolean {
  return memberOf.has(source.projectId) && source.audienceProjectIds.every((id) => memberOf.has(id));
}

/** Same check for one user by id (single source, realtime fan-out). */
export async function userCanSeeSource(db: Database, source: Pick<SourceRow, 'projectId' | 'audienceProjectIds'>, userId: string): Promise<boolean> {
  const roles = await Promise.all([source.projectId, ...source.audienceProjectIds].map((id) => getProjectRole(db, id, userId)));
  return roles.every((r) => r !== null);
}
