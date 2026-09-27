import type { ProjectMemberRow, ProjectRow, TaskRow, UserRow } from '@tectonic/db';
import type { Project, ProjectMember, Task, User } from '@tectonic/shared';

const iso = (d: Date) => d.toISOString();

export function serializeUser(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, color: row.color, createdAt: iso(row.createdAt) };
}

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    ownerId: row.ownerId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function serializeMember(row: ProjectMemberRow, user: UserRow): ProjectMember {
  return { projectId: row.projectId, userId: row.userId, role: row.role, user: serializeUser(user) };
}

export function serializeTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    position: row.position,
    version: row.version,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
