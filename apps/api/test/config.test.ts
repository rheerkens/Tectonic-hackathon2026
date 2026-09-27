import { describe, expect, test } from 'bun:test';
import { ConfigError, RAILWAY_ENV_KEYS, isProductionLike, resolveAuthMode, resolveConfig } from '../src/config.ts';

const DB = 'postgres://u:p@localhost:5432/db';

describe('auth mode resolution', () => {
  test('defaults to the dev bypass locally', () => {
    expect(resolveAuthMode({})).toBe('dev-bypass');
    expect(resolveAuthMode({ NODE_ENV: 'development' })).toBe('dev-bypass');
  });

  test('prefers Clerk when a secret key is present', () => {
    expect(resolveAuthMode({ CLERK_SECRET_KEY: 'sk_test_x' })).toBe('clerk');
    expect(resolveAuthMode({ AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_x' })).toBe('clerk');
  });

  test('clerk mode without a secret key is a configuration error', () => {
    expect(() => resolveAuthMode({ AUTH_MODE: 'clerk' })).toThrow(ConfigError);
  });

  test('rejects the bypass when NODE_ENV=production', () => {
    expect(() => resolveAuthMode({ AUTH_MODE: 'dev-bypass', NODE_ENV: 'production' })).toThrow(/rejected in production/);
  });

  test.each(RAILWAY_ENV_KEYS.map((k) => [k] as const))('rejects the bypass when %s is set (Railway)', (key) => {
    expect(isProductionLike({ [key]: 'something' })).toBe(true);
    expect(() => resolveAuthMode({ AUTH_MODE: 'dev-bypass', [key]: 'something' })).toThrow(ConfigError);
    // Even when no AUTH_MODE is requested, production must not silently fall back to the bypass.
    expect(() => resolveAuthMode({ [key]: 'something' })).toThrow(/No authentication configured/);
  });

  test('production with Clerk configured is accepted', () => {
    expect(resolveAuthMode({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production', CLERK_SECRET_KEY: 'sk_live_x' })).toBe('clerk');
  });

  test('unknown modes are rejected', () => {
    expect(() => resolveAuthMode({ AUTH_MODE: 'none' })).toThrow(/Unknown AUTH_MODE/);
  });
});

describe('resolveConfig', () => {
  test('requires DATABASE_URL', () => {
    expect(() => resolveConfig({})).toThrow(/DATABASE_URL/);
  });

  test('enables static serving and info logging in production-like environments', () => {
    const config = resolveConfig({ DATABASE_URL: DB, RAILWAY_PROJECT_ID: 'x', CLERK_SECRET_KEY: 'sk' });
    expect(config.productionLike).toBe(true);
    expect(config.serveStatic).toBe(true);
    expect(config.authMode).toBe('clerk');
    expect(config.clerk?.secretKey).toBe('sk');
  });

  test('parses ports and CORS origins', () => {
    const config = resolveConfig({ DATABASE_URL: DB, PORT: '4321', CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.port).toBe(4321);
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(() => resolveConfig({ DATABASE_URL: DB, PORT: 'abc' })).toThrow(/Invalid PORT/);
  });
});
