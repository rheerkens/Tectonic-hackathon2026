import type { Database } from '@tectonic/db';
import { WS_PATH } from '@tectonic/shared';
import type { Server } from 'bun';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { createAuthenticator, type Authenticator, type Principal } from './auth.ts';
import type { AppConfig } from './config.ts';
import { createLlmClient, type LlmClient } from './llm.ts';
import { ApiError } from './errors.ts';
import { createLogger, type Logger } from './log.ts';
import { createRealtime, type Realtime, type SocketData } from './realtime.ts';
import { chatRoutes } from './routes/chat.ts';
import { knowledgeRoutes } from './routes/knowledge.ts';
import { healthRoutes } from './routes/health.ts';
import { userRoutes } from './routes/users.ts';
import { createStaticHandler } from './static.ts';

export interface AppEnv {
  Bindings: Server<SocketData>;
  Variables: { principal: Principal };
}

export interface AppContext {
  config: AppConfig;
  db: Database;
  authenticator: Authenticator;
  realtime: Realtime;
  log: Logger;
  /** null without ANTHROPIC_API_KEY: chat then uses its deterministic fallback. */
  llm: LlmClient | null;
  startedAt: number;
}

export interface CreatedApp {
  app: Hono<AppEnv>;
  ctx: AppContext;
  fetch: (request: Request, server: Server<SocketData>) => Response | Promise<Response>;
  websocket: Realtime['websocket'];
}

/** Native shells load the web bundle from these origins. Extra origins come from CORS_ORIGINS. */
const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'tauri://localhost', 'https://tauri.localhost'];

/** Clerk's frontend API host is base64-encoded in the publishable key (`pk_test_<base64(host$)>`). */
function clerkHost(publishableKey: string | null): string | null {
  const encoded = publishableKey?.split('_')[2];
  if (!encoded) return null;
  try {
    const host = atob(encoded).replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

/** Limits scripts/connections to self plus Clerk (+ Cloudflare challenge). `wss:` covers /ws; ponytail: any wss host, narrow if a split API origin is used. */
function buildCsp(publishableKey: string | null, extraOrigins: string[]) {
  const host = clerkHost(publishableKey);
  const clerk = ['https://*.clerk.accounts.dev', 'https://*.clerk.com', ...(host ? [host] : [])];
  const cf = 'https://challenges.cloudflare.com';
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", ...clerk, cf],
    connectSrc: ["'self'", 'wss:', ...clerk, ...extraOrigins],
    frameSrc: ["'self'", ...clerk, cf],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://img.clerk.com', ...clerk],
    styleSrc: ["'self'", "'unsafe-inline'"],
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    formAction: ["'self'"],
  };
}

export function createApp(deps: { config: AppConfig; db: Database; log?: Logger; authenticator?: Authenticator; llm?: LlmClient | null }): CreatedApp {
  const { config, db } = deps;
  const log = deps.log ?? createLogger(config.productionLike ? 'info' : 'debug');
  const authenticator = deps.authenticator ?? createAuthenticator(config, db);
  const realtime = createRealtime({ db, authenticator, log });
  const llm = deps.llm === undefined ? createLlmClient(config.llm) : deps.llm;
  const ctx: AppContext = { config, db, authenticator, realtime, log, llm, startedAt: Date.now() };

  const app = new Hono<AppEnv>();

  // nosniff, frame and referrer protection on API and static responses. Popups stay allowed for Clerk sign-in flows.
  app.use(
    '*',
    secureHeaders({
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      referrerPolicy: 'strict-origin-when-cross-origin',
      contentSecurityPolicy: buildCsp(config.clerk?.publishableKey ?? null, config.corsOrigins),
    }),
  );

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        if (NATIVE_ORIGINS.includes(origin) || config.corsOrigins.includes(origin)) return origin;
        if (!config.productionLike && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return origin;
        return null;
      },
      allowHeaders: ['Authorization', 'Content-Type', 'x-dev-user'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use('/api/*', async (c, next) => {
    const started = performance.now();
    await next();
    log.debug(`${c.req.method} ${c.req.path} -> ${c.res.status} ${(performance.now() - started).toFixed(1)}ms`);
  });

  /** Everything under /api except /api/health requires a principal. */
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') return next();
    const principal = await authenticator.authenticate({
      authorization: c.req.header('authorization'),
      devUser: c.req.header('x-dev-user'),
    });
    c.set('principal', principal);
    await next();
  });

  app.route('/', healthRoutes(ctx));
  app.route('/', userRoutes(ctx));
  app.route('/', knowledgeRoutes(ctx));
  app.route('/', chatRoutes(ctx));

  app.get(WS_PATH, (c) => realtime.upgrade(c.req.raw, c.env));

  const serveStatic = config.serveStatic ? createStaticHandler(config.staticDir) : null;
  app.notFound(async (c) => {
    if (serveStatic && !c.req.path.startsWith('/api/')) {
      const response = await serveStatic(c.req.raw);
      if (response) return response;
    }
    return c.json({ error: { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } }, 404);
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status as 400);
    if (error instanceof HTTPException) {
      return c.json({ error: { code: 'bad_request', message: error.message } }, error.status as 400);
    }
    log.error('Unhandled error', { path: c.req.path, message: error instanceof Error ? error.message : String(error) });
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  });

  return {
    app,
    ctx,
    fetch: (request, server) => {
      realtime.attach(server);
      return app.fetch(request, server);
    },
    websocket: realtime.websocket,
  };
}
