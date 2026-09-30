import { createDb, runMigrations, seedDatabase, waitForDatabase, type DbHandle } from '@tectonic/db';
import { DEV_USER_HEADER, type ServerMessage } from '@tectonic/shared';
import type { Server } from 'bun';
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.ts';
import type { AppContext } from '../src/app.ts';
import { resolveConfig, type AppConfig } from '../src/config.ts';
import { silentLogger } from '../src/log.ts';
import type { SocketData } from '../src/realtime.ts';
import type { ChatRunner, ChatStatusReader } from '../src/routes/project-chat.ts';

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export interface TestStack {
  baseUrl: string;
  wsUrl: string;
  databaseUrl: string;
  config: AppConfig;
  appContext: AppContext;
  handle: DbHandle;
  server: Server<SocketData>;
  /** Stops and restarts Postgres, keeping its data directory. */
  restartDatabase(): Promise<void>;
  /** Tears down the HTTP server and recreates it against the same database. */
  restartServer(): Promise<void>;
  stop(): Promise<void>;
}

export async function startTestStack(options: {
  env?: Record<string, string>;
  seed?: boolean;
  chatRunner?: ChatRunner;
  chatStatus?: ChatStatusReader;
} = {}): Promise<TestStack> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tectonic-api-test-'));
  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(dir, 'pg'),
    user: 'tectonic',
    password: 'tectonic',
    port: pgPort,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('tectonic');
  const databaseUrl = `postgres://tectonic:tectonic@127.0.0.1:${pgPort}/tectonic`;
  await waitForDatabase(databaseUrl);
  await runMigrations(databaseUrl);

  let handle = createDb(databaseUrl, { max: 4 });
  if (options.seed !== false) await seedDatabase(handle.db);

  const config = resolveConfig({
    AUTH_MODE: 'dev-bypass',
    DATABASE_URL: databaseUrl,
    HOST: '127.0.0.1',
    PORT: '0',
    SERVE_STATIC: '0',
    ...options.env,
  });

  let server: Server<SocketData>;
  let appContext: AppContext;
  const boot = () => {
    const created = createApp({
      config,
      db: handle.db,
      log: silentLogger,
      chatRunner: options.chatRunner,
      chatStatus: options.chatStatus,
    });
    appContext = created.ctx;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: created.fetch, websocket: created.websocket });
  };
  boot();

  const stack: TestStack = {
    get baseUrl() {
      return `http://127.0.0.1:${server.port}`;
    },
    get wsUrl() {
      return `ws://127.0.0.1:${server.port}/ws`;
    },
    databaseUrl,
    config,
    get appContext() {
      return appContext;
    },
    get handle() {
      return handle;
    },
    get server() {
      return server;
    },
    async restartDatabase() {
      await handle.close();
      await pg.stop();
      await pg.start();
      await waitForDatabase(databaseUrl);
      handle = createDb(databaseUrl, { max: 4 });
      server.stop(true);
      boot();
    },
    async restartServer() {
      server.stop(true);
      boot();
    },
    async stop() {
      server.stop(true);
      await handle.close().catch(() => {});
      await pg.stop().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return stack;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

/** Minimal HTTP client that speaks the dev bypass. */
export function apiClient(baseUrl: string, devUser: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (devUser) headers[DEV_USER_HEADER] = devUser;
  const call = async <T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  };
  return {
    get: <T = unknown>(path: string) => call<T>('GET', path),
    post: <T = unknown>(path: string, body: unknown) => call<T>('POST', path, body),
    patch: <T = unknown>(path: string, body: unknown) => call<T>('PATCH', path, body),
    delete: <T = unknown>(path: string) => call<T>('DELETE', path),
  };
}

/** A WebSocket test client with a message queue and typed waits. */
export class WsClient {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.closed = new Promise((resolve) => {
      this.socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      this.messages.push(message);
      const index = this.waiters.findIndex((w) => w.predicate(message));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        waiter!.resolve(message);
      }
    });
  }

  static async connect(url: string): Promise<WsClient> {
    const client = new WsClient(url);
    await new Promise<void>((resolve, reject) => {
      client.socket.addEventListener('open', () => resolve());
      client.socket.addEventListener('error', () => reject(new Error('ws error')));
    });
    return client;
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  async auth(devUser: string) {
    this.send({ type: 'auth', devUser });
    return this.waitFor((m) => m.type === 'hello' || m.type === 'error');
  }

  async subscribe(projectId: string) {
    this.send({ type: 'subscribe', projectId });
    return this.waitFor((m) => (m.type === 'subscribed' || m.type === 'error') && m.projectId === projectId);
  }

  waitFor<T extends ServerMessage>(predicate: (m: ServerMessage) => boolean, timeoutMs = 5_000): Promise<T> {
    const existing = this.messages.find(predicate);
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1);
      return Promise.resolve(existing as T);
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error(`Timed out waiting for message; received: ${JSON.stringify(this.messages.map((m) => m.type))}`));
      }, timeoutMs);
      const wrapped = (m: ServerMessage) => {
        clearTimeout(timer);
        this.messages.splice(this.messages.indexOf(m), 1);
        resolve(m as T);
      };
      this.waiters.push({ predicate, resolve: wrapped });
    });
  }

  /** Resolves true if a matching message arrives within the window, false otherwise. */
  async expectNone(predicate: (m: ServerMessage) => boolean, windowMs = 400): Promise<boolean> {
    try {
      await this.waitFor(predicate, windowMs);
      return false;
    } catch {
      return true;
    }
  }

  close() {
    this.socket.close();
  }
}
