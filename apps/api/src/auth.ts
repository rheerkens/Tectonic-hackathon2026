import { createClerkClient, verifyToken } from '@clerk/backend';
import { users, type Database } from '@tectonic/db';
import { DEMO_USERS, DEV_USER_HEADER, findDemoUser, type AuthSource } from '@tectonic/shared';
import { eq, sql } from 'drizzle-orm';
import type { AppConfig } from './config.ts';
import { unauthorized } from './errors.ts';
import { createLogger } from './log.ts';

const log = createLogger();

export interface Principal {
  userId: string;
  name: string;
  email: string | null;
  color: string;
  source: AuthSource;
}

export interface AuthInput {
  /** `Authorization` header value (HTTP) or bearer token (WebSocket auth message). */
  authorization?: string | null;
  /** `x-dev-user` header value (HTTP) or `devUser` field (WebSocket auth message). */
  devUser?: string | null;
}

export interface Authenticator {
  readonly mode: AuthSource;
  authenticate(input: AuthInput): Promise<Principal>;
}

const PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f97316', '#14b8a6'];
export function colorForId(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

function bearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

/** Upserts the user row so foreign keys resolve; cached per process to avoid a write per request. */
function createUserEnsurer(db: Database) {
  const ensured = new Set<string>();
  return async (principal: Principal): Promise<void> => {
    if (ensured.has(principal.userId)) return;
    await db
      .insert(users)
      .values({ id: principal.userId, name: principal.name, email: principal.email, color: principal.color })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: sql`excluded.name`, email: sql`excluded.email` },
      });
    ensured.add(principal.userId);
  };
}

/**
 * Local development bypass. Only constructed when the server config allowed it,
 * which `resolveAuthMode` refuses for production/Railway environments.
 */
export function createDevBypassAuthenticator(db: Database): Authenticator {
  const ensure = createUserEnsurer(db);
  return {
    mode: 'dev-bypass',
    async authenticate(input) {
      const id = input.devUser?.trim() || null;
      if (!id) {
        throw unauthorized(
          `Dev auth bypass is active: send the ${DEV_USER_HEADER} header with one of ${DEMO_USERS.map((u) => u.id).join(', ')}.`,
        );
      }
      const demo = findDemoUser(id);
      if (!demo) throw unauthorized(`Unknown demo identity "${id}".`);
      const principal: Principal = { userId: demo.id, name: demo.name, email: demo.email, color: demo.color, source: 'dev-bypass' };
      await ensure(principal);
      return principal;
    },
  };
}

/**
 * Clerk session tokens (`Authorization: Bearer <jwt>`). Verified locally against
 * Clerk's JWKS; user profile details are fetched once per process per user.
 */
export function createClerkAuthenticator(db: Database, config: NonNullable<AppConfig['clerk']>): Authenticator {
  const clerk = createClerkClient({ secretKey: config.secretKey, publishableKey: config.publishableKey ?? undefined });
  const ensure = createUserEnsurer(db);
  const profiles = new Map<string, Omit<Principal, 'source'>>();

  return {
    mode: 'clerk',
    async authenticate(input) {
      if (input.devUser) {
        throw unauthorized(`The ${DEV_USER_HEADER} header is not accepted: the dev auth bypass is disabled on this server.`);
      }
      const token = bearer(input.authorization);
      if (!token) throw unauthorized('Missing bearer token');

      let subject: string;
      try {
        const payload = await verifyToken(token, {
          secretKey: config.secretKey,
          // ponytail: empty list = azp not checked (avoids lockout when no origin is configured)
          ...(config.authorizedParties.length > 0 && { authorizedParties: config.authorizedParties }),
        });
        subject = payload.sub;
      } catch (error) {
        log.warn('clerk token rejected', { message: error instanceof Error ? error.message : String(error) });
        throw unauthorized('Invalid session token');
      }

      let profile = profiles.get(subject);
      if (!profile) {
        const [row] = await db.select().from(users).where(eq(users.id, subject)).limit(1);
        if (row) {
          profile = { userId: row.id, name: row.name, email: row.email, color: row.color };
        } else {
          const user = await clerk.users.getUser(subject);
          const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.primaryEmailAddress?.emailAddress || subject;
          profile = { userId: subject, name, email: user.primaryEmailAddress?.emailAddress ?? null, color: colorForId(subject) };
        }
        profiles.set(subject, profile);
      }
      const principal: Principal = { ...profile, source: 'clerk' };
      await ensure(principal);
      return principal;
    },
  };
}

export function createAuthenticator(config: AppConfig, db: Database): Authenticator {
  if (config.authMode === 'clerk') {
    if (!config.clerk) throw new Error('Clerk config missing');
    return createClerkAuthenticator(db, config.clerk);
  }
  if (config.productionLike) {
    // Defense in depth: resolveAuthMode already refuses this combination.
    throw new Error('Refusing to enable the dev auth bypass in a production-like environment.');
  }
  return createDevBypassAuthenticator(db);
}
