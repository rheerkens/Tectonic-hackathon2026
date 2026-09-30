import type { SourceRow, UserRow } from '@tectonic/db';
import type { Source, User } from '@tectonic/shared';

const iso = (d: Date) => d.toISOString();

export function serializeUser(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, color: row.color, createdAt: iso(row.createdAt) };
}

export function serializeSource(row: SourceRow): Source {
  return {
    id: row.id,
    code: row.code,
    projectId: row.projectId,
    title: row.title,
    kind: row.kind,
    version: row.version,
    topic: row.topic,
    keywords: row.keywords,
    country: row.country as Source['country'],
    client: row.client,
    value: row.value,
    claim: row.claim,
    quote: row.quote,
    validFrom: row.validFrom,
    validTo: row.validTo,
    status: row.status,
    ownerId: row.ownerId,
    approvedById: row.approvedById,
    traceable: row.traceable,
    supersededBy: row.supersededBy,
    createdAt: iso(row.createdAt),
  };
}
