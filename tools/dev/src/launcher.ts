import { createDb, runMigrations, seedDatabase, waitForDatabase } from '@tectonic/db';
import AsyncExitHook from 'async-exit-hook';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import rootPackage from '../../../package.json' with { type: 'json' };
import { acquireLock, AlreadyRunningError } from './lock.ts';
import { allocatePorts, isPortFree } from './ports.ts';
import { startPostgres, type PostgresHandle } from './postgres.ts';
import { spawnManaged, stopManaged, type ManagedProcess } from './procs.ts';
import { createShutdown } from './shutdown.ts';
import { buildUrls, readRuntime, runtimeFile, writeRuntime, type RuntimeInfo } from './runtime.ts';
import { hashPath, listWorktreeRoots, localDir, resolveWorktree } from './worktree.ts';

export interface LaunchOptions {
  cwd?: string;
  profile?: string;
  resetDb?: boolean;
  /** Skip the Vite dev server (API + database only). */
  apiOnly?: boolean;
  /** Don't print the banner (used by tests/tools). */
  quiet?: boolean;
  /** Called after everything is ready. Return to keep running until a signal arrives. */
  onReady?: (runtime: RuntimeInfo) => void | Promise<void>;
}

const COLORS = { dev: '\x1b[36m', pg: '\x1b[35m', api: '\x1b[33m', web: '\x1b[32m', reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m' };
type Source = 'dev' | 'pg' | 'api' | 'web';

export function makeLogger(quiet: boolean) {
  return (source: Source, line: string) => {
    if (quiet && source !== 'dev') return;
    const color = COLORS[source];
    console.log(`${color}[${source.padEnd(3)}]${COLORS.reset} ${line}`);
  };
}

/** Ports recorded by the other worktrees of this repo, so two stacks never race for the same block. */
async function portsReservedByOtherWorktrees(root: string, profile: string): Promise<number[]> {
  const reserved: number[] = [];
  let roots: string[] = [];
  try {
    roots = await listWorktreeRoots(root);
  } catch {
    return reserved;
  }
  for (const other of roots) {
    if (path.resolve(other) === path.resolve(root)) continue;
    const base = path.join(other, '.local');
    if (!existsSync(base)) continue;
    for (const entry of ['dev', profile, ...listProfiles(base)]) {
      const info = readRuntime(path.join(base, entry));
      if (info && info.status !== 'stopped') reserved.push(info.ports.web, info.ports.api, info.ports.postgres);
    }
  }
  return reserved;
}

function listProfiles(base: string): string[] {
  try {
    return [...new Bun.Glob('*/runtime.json').scanSync({ cwd: base })].map((p) => path.dirname(p));
  } catch {
    return [];
  }
}

export async function launch(options: LaunchOptions = {}): Promise<void> {
  // Older Bun HTTP upgrade sockets crash Vite's WebSocket proxy. Reject the
  // unsupported runtime before allocating ports, acquiring locks or resetting data.
  if (!Bun.semver.satisfies(Bun.version, rootPackage.engines.bun)) {
    const pinnedVersion = rootPackage.packageManager.replace(/^bun@/, '');
    throw new Error(
      `Bun ${rootPackage.engines.bun} is required (running ${Bun.version}). Install the pinned version: curl -fsSL https://bun.sh/install | bash -s -- bun-v${pinnedVersion}`,
    );
  }
  const profile = options.profile ?? 'dev';
  const worktree = await resolveWorktree(options.cwd ?? process.cwd());
  const local = localDir(worktree.root, profile);
  const paths = {
    local,
    postgresData: path.join(local, 'postgres'),
    logs: path.join(local, 'logs'),
    lock: path.join(local, 'dev.lock'),
    runtime: runtimeFile(local),
  };
  mkdirSync(paths.logs, { recursive: true });
  const log = makeLogger(options.quiet ?? false);

  // 1. One stack per worktree+profile.
  let releaseLock: () => void;
  try {
    releaseLock = acquireLock(paths.lock, { pid: process.pid, profile, root: worktree.root });
  } catch (error) {
    if (error instanceof AlreadyRunningError) {
      const existing = readRuntime(local);
      log('dev', `${COLORS.bold}${error.message}${COLORS.reset}`);
      if (existing?.status === 'ready') log('dev', `It is serving ${existing.urls.web} (api ${existing.urls.api}).`);
      log('dev', `Stop it with: bun run dev:stop${profile !== 'dev' ? ` --profile ${profile}` : ''}`);
      // Explicit exit: a dependency's exit hook would otherwise reset process.exitCode to 0.
      process.exit(3);
    }
    throw error;
  }

  const previous = readRuntime(local);
  if (options.resetDb && existsSync(paths.postgresData)) {
    log('dev', 'resetting database (--reset-db)');
    rmSync(paths.postgresData, { recursive: true, force: true });
  }

  // 2. Ports: reuse last run's ports when free, otherwise probe from a path-derived offset.
  const reserved = await portsReservedByOtherWorktrees(worktree.root, profile);
  const ports = await allocatePorts({
    preferred: previous?.ports ?? null,
    seed: hashPath(`${worktree.root}#${profile}`),
    reserved,
  });
  if (previous && previous.ports.web !== ports.web) {
    log('dev', `previous port ${previous.ports.web} is busy; using ${ports.web} instead`);
  }

  const authMode = process.env.AUTH_MODE?.trim() || (process.env.CLERK_SECRET_KEY ? 'clerk' : 'dev-bypass');
  const runtime: RuntimeInfo = {
    status: 'starting',
    profile,
    worktree: { root: worktree.root, name: worktree.name, id: worktree.id },
    launcherPid: process.pid,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ports,
    urls: buildUrls(ports, ''),
    env: { DATABASE_URL: '', API_PORT: String(ports.api), WEB_PORT: String(ports.web), AUTH_MODE: authMode },
    pids: { api: null, web: null, postgres: null },
    paths,
  };
  writeRuntime(local, runtime);

  const children: ManagedProcess[] = [];
  let postgres: PostgresHandle | null = null;
  let stopping = false;
  const shutdown = createShutdown(async (reason, code) => {
    stopping = true;
    log('dev', `shutting down (${reason})`);
    await Promise.all(children.map((child) => stopManaged(child).catch(() => {})));
    if (postgres) await postgres.stop().catch((error) => log('pg', `stop failed: ${String(error)}`));
    writeRuntime(local, { ...runtime, status: code === 0 ? 'stopped' : 'failed', pids: { api: null, web: null, postgres: null } });
    releaseLock();
  });
  AsyncExitHook((done) => {
    void shutdown('process exit').then(done, (error: unknown) => {
      log('dev', `shutdown failed: ${String(error)}`);
      done();
    });
  });

  try {
    // 3. Database, migrations, seed.
    postgres = await startPostgres({ dataDir: paths.postgresData, port: ports.postgres, log: (line) => log('pg', line) });
    runtime.pids.postgres = postgres.pid;
    runtime.urls = buildUrls(ports, postgres.url);
    runtime.env.DATABASE_URL = postgres.url;
    await waitForDatabase(postgres.url);
    await runMigrations(postgres.url);
    const handle = createDb(postgres.url, { max: 2 });
    const seeded = await seedDatabase(handle.db);
    await handle.close();
    log('pg', `ready on 127.0.0.1:${ports.postgres} ${seeded.seeded ? `(seeded ${seeded.projects} teams, ${seeded.sources} sources)` : '(existing data kept)'}`);

    // 4. API.
    const childEnv = {
      ...process.env,
      DEV_LAUNCHER_PID: String(process.pid),
      DATABASE_URL: postgres.url,
      AUTH_MODE: authMode,
      API_PORT: String(ports.api),
      WEB_PORT: String(ports.web),
      FORCE_COLOR: '1',
    };
    const api = spawnManaged({
      name: 'api',
      // process.execPath, not `bun` from PATH: children run on the runtime checked above.
      cmd: [process.execPath, '--watch', '--no-clear-screen', 'src/index.ts'],
      cwd: path.join(worktree.root, 'apps/api'),
      env: { ...childEnv, PORT: String(ports.api), HOST: '0.0.0.0', SERVE_STATIC: '0' },
      onLine: (line) => log('api', line.replace(/^\[api\]\s*/, '')),
    });
    children.push(api);
    runtime.pids.api = api.proc.pid;
    void api.exited.then((code) => {
      if (!stopping) void shutdown(`api exited with code ${code}`, 1).then(() => process.exit(1));
    });
    await waitForHttp(runtime.urls.apiHealth, 30_000);

    // 5. Web (Vite under Bun, proxying /api and /ws to the API).
    if (!options.apiOnly) {
      const viteBin = path.join(worktree.root, 'apps/web/node_modules/vite/bin/vite.js');
      const web = spawnManaged({
        name: 'web',
        cmd: [process.execPath, viteBin, '--host', '0.0.0.0', '--port', String(ports.web), '--strictPort', '--clearScreen', 'false'],
        cwd: path.join(worktree.root, 'apps/web'),
        env: childEnv,
        onLine: (line) => {
          // Vite's own banner duplicates ours; keep everything else (errors, HMR notices).
          const plain = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (plain && !/^(➜|VITE v)/.test(plain) && !/Local:|Network:|press h \+ enter/.test(plain)) log('web', line.trim());
        },
      });
      children.push(web);
      runtime.pids.web = web.proc.pid;
      void web.exited.then((code) => {
        if (!stopping) void shutdown(`web exited with code ${code}`, 1).then(() => process.exit(1));
      });
      await waitForHttp(runtime.urls.web, 30_000);
    }

    runtime.status = 'ready';
    writeRuntime(local, runtime);
    printBanner(runtime, log, options.apiOnly ?? false);
    await options.onReady?.(runtime);
  } catch (error) {
    runtime.error = error instanceof Error ? error.message : String(error);
    log('dev', `\x1b[31mstartup failed: ${runtime.error}\x1b[0m`);
    writeRuntime(local, { ...runtime, status: 'failed' });
    await shutdown('startup failure', 1);
    process.exit(1);
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(200);
  }
  throw new Error(`${url} did not become ready within ${timeoutMs / 1000}s (${lastError})`);
}

function printBanner(runtime: RuntimeInfo, log: ReturnType<typeof makeLogger>, apiOnly: boolean) {
  const { bold, dim, reset } = COLORS;
  const lines = [
    '',
    `${bold}Tectonic dev stack ready${reset}  ${dim}worktree "${runtime.worktree.name}" · profile "${runtime.profile}" · auth ${runtime.env.AUTH_MODE}${reset}`,
    ...(apiOnly ? [] : [`  Web       ${bold}${runtime.urls.web}${reset}`, ...runtime.urls.webLan.map((u) => `            ${u}`)]),
    `  API       ${runtime.urls.api}  ${dim}(${runtime.urls.apiHealth})${reset}`,
    `  WebSocket ${runtime.urls.ws}`,
    `  Postgres  ${runtime.urls.database}`,
    `  Runtime   ${runtime.paths.runtime}`,
    `${dim}  Ctrl+C stops only this worktree's processes. Data persists in ${runtime.paths.postgresData}${reset}`,
    '',
  ];
  for (const line of lines) log('dev', line);
}

/** Used by `dev:stop`: signals the launcher recorded in the lock file (and only that process). */
export async function stopStack(options: { cwd?: string; profile?: string } = {}): Promise<boolean> {
  const profile = options.profile ?? 'dev';
  const worktree = await resolveWorktree(options.cwd ?? process.cwd());
  const local = localDir(worktree.root, profile);
  const { readLock, isProcessAlive } = await import('./lock.ts');
  const lock = readLock(path.join(local, 'dev.lock'));
  if (!lock || !isProcessAlive(lock.pid)) {
    console.log(`No running dev stack for worktree "${worktree.name}" (profile "${profile}").`);
    return false;
  }
  if (lock.root && path.resolve(lock.root) !== path.resolve(worktree.root)) {
    console.log(`Lock belongs to another worktree (${lock.root}); refusing to stop it.`);
    return false;
  }
  process.kill(lock.pid, 'SIGTERM');
  const deadline = Date.now() + 20_000;
  while (isProcessAlive(lock.pid) && Date.now() < deadline) await Bun.sleep(200);
  const stopped = !isProcessAlive(lock.pid);
  console.log(stopped ? `Stopped dev stack (pid ${lock.pid}).` : `Launcher pid ${lock.pid} is still running; inspect it manually.`);
  return stopped;
}

export async function stackStatus(options: { cwd?: string; profile?: string } = {}): Promise<RuntimeInfo | null> {
  const profile = options.profile ?? 'dev';
  const worktree = await resolveWorktree(options.cwd ?? process.cwd());
  const local = localDir(worktree.root, profile);
  const info = readRuntime(local);
  const { readLock, isProcessAlive } = await import('./lock.ts');
  const lock = readLock(path.join(local, 'dev.lock'));
  const running = Boolean(lock && isProcessAlive(lock.pid));
  if (!info) return null;
  if (!running && info.status !== 'stopped' && info.status !== 'failed') {
    return { ...info, status: 'stopped' };
  }
  if (running && info.status === 'ready' && !(await isPortFree(info.ports.api))) return info;
  return running ? info : { ...info, status: 'stopped' };
}
