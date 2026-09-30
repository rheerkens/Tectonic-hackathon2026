import { fileURLToPath } from 'node:url';
import type { AuthSource } from '@tectonic/shared';
import pkg from '../package.json' with { type: 'json' };

export type AuthMode = AuthSource;
export type EnvLike = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  authMode: AuthMode;
  clerk: { secretKey: string; publishableKey: string | null; authorizedParties: string[] } | null;
  /** True when running in production or on Railway: the dev auth bypass is rejected. */
  productionLike: boolean;
  corsOrigins: string[];
  serveStatic: boolean;
  staticDir: string;
  autoMigrate: boolean;
  version: string;
}

/** Variables Railway injects into every deployment. Any of them marks the environment as production-like. */
export const RAILWAY_ENV_KEYS = [
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_PROJECT_NAME',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_PUBLIC_DOMAIN',
  'RAILWAY_PRIVATE_DOMAIN',
  'RAILWAY_STATIC_URL',
] as const;

export function isProductionLike(env: EnvLike): boolean {
  if (env.NODE_ENV === 'production') return true;
  return RAILWAY_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
}

/**
 * Decides which authentication mode the server runs in and enforces the rule
 * that the local dev bypass can never be active in production or on Railway.
 */
export function resolveAuthMode(env: EnvLike): AuthMode {
  const requested = (env.AUTH_MODE ?? '').trim();
  const production = isProductionLike(env);
  const hasClerkSecret = Boolean(env.CLERK_SECRET_KEY?.trim());

  let mode: AuthMode;
  if (requested === '') {
    if (hasClerkSecret) mode = 'clerk';
    else if (production) {
      throw new ConfigError(
        'No authentication configured for a production/Railway environment. Set AUTH_MODE=clerk and CLERK_SECRET_KEY (the dev bypass is not permitted here).',
      );
    } else mode = 'dev-bypass';
  } else if (requested === 'dev-bypass' || requested === 'clerk') {
    mode = requested;
  } else {
    throw new ConfigError(`Unknown AUTH_MODE "${requested}". Use "dev-bypass" (local only) or "clerk".`);
  }

  if (mode === 'dev-bypass' && production) {
    const markers = ['NODE_ENV=production', ...RAILWAY_ENV_KEYS]
      .filter((key) => (key === 'NODE_ENV=production' ? env.NODE_ENV === 'production' : Boolean(env[key]?.trim())))
      .join(', ');
    throw new ConfigError(
      `AUTH_MODE=dev-bypass is rejected in production/Railway environments (detected: ${markers}). Set AUTH_MODE=clerk and CLERK_SECRET_KEY.`,
    );
  }
  if (mode === 'clerk' && !hasClerkSecret) {
    throw new ConfigError('AUTH_MODE=clerk requires CLERK_SECRET_KEY.');
  }
  return mode;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`Invalid PORT "${value}"`);
  return port;
}

export function resolveConfig(env: EnvLike = process.env): AppConfig {
  const authMode = resolveAuthMode(env);
  const productionLike = isProductionLike(env);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ConfigError('DATABASE_URL is required. Locally, `bun run dev` provides it automatically.');
  }
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultStaticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port: parsePort(env.PORT, 3001),
    databaseUrl,
    authMode,
    clerk:
      authMode === 'clerk'
        ? {
            secretKey: env.CLERK_SECRET_KEY!.trim(),
            publishableKey: env.CLERK_PUBLISHABLE_KEY?.trim() || null,
            authorizedParties: [...corsOrigins, ...(env.RAILWAY_PUBLIC_DOMAIN?.trim() ? [`https://${env.RAILWAY_PUBLIC_DOMAIN.trim()}`] : [])],
          }
        : null,
    productionLike,
    corsOrigins,
    serveStatic: env.SERVE_STATIC !== undefined ? env.SERVE_STATIC === '1' || env.SERVE_STATIC === 'true' : productionLike,
    staticDir: env.STATIC_DIR?.trim() || defaultStaticDir,
    autoMigrate: env.AUTO_MIGRATE === '1' || env.AUTO_MIGRATE === 'true',
    version: pkg.version,
  };
}
