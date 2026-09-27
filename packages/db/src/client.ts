import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export interface DbHandle {
  db: ReturnType<typeof createDrizzle>;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
}

function createDrizzle(sql: ReturnType<typeof postgres>) {
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDrizzle>;

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = createDrizzle(sql);
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

/** Resolves once the server accepts connections, retrying for `timeoutMs`. */
export async function waitForDatabase(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end({ timeout: 1 });
      return;
    } catch (error) {
      lastError = error;
      await sql.end({ timeout: 1 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Database not reachable at ${redact(url)}: ${String(lastError)}`);
}

export function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url;
  }
}
