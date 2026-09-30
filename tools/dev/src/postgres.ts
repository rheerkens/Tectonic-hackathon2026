import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isProcessAlive } from './lock.ts';

export interface PostgresOptions {
  dataDir: string;
  port: number;
  user?: string;
  /** File (mode 0600) holding the generated password; created on first start. */
  passwordFile: string;
  database?: string;
  log?: (line: string) => void;
}

export interface PostgresHandle {
  /** Full connection URL including the password: pass to child processes only, never print or persist. */
  url: string;
  maskedUrl: string;
  pid: number | null;
  stop(): Promise<void>;
}

/**
 * If a previous launcher was killed hard, the `postgres` it started may still
 * own the data directory. It belongs to this worktree, so stop it gracefully.
 */
export async function stopStalePostgres(dataDir: string, log: (line: string) => void): Promise<void> {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').split('\n')[0]);
  if (!isProcessAlive(pid)) return;
  log(`stopping stale postgres (pid ${pid}) left behind by a previous run`);
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 15_000;
  while (isProcessAlive(pid) && Date.now() < deadline) await Bun.sleep(200);
  if (isProcessAlive(pid)) throw new Error(`Stale postgres pid ${pid} did not stop; stop it manually`);
}

/** Password for this profile's database: random per profile, kept in a 0600 file next to the data. */
export function loadPassword(passwordFile: string, dataDir: string): string {
  if (existsSync(passwordFile)) return readFileSync(passwordFile, 'utf8').trim();
  // A data directory from before this file existed was initialised with the old fixed password.
  const password = existsSync(path.join(dataDir, 'PG_VERSION')) ? 'tectonic' : randomBytes(18).toString('base64url');
  mkdirSync(path.dirname(passwordFile), { recursive: true });
  writeFileSync(passwordFile, password, { mode: 0o600 });
  return password;
}

export function databaseUrl(port: number, password: string, user = 'tectonic', database = 'tectonic'): string {
  return `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;
}

export async function startPostgres(options: PostgresOptions): Promise<PostgresHandle> {
  const user = options.user ?? 'tectonic';
  const password = loadPassword(options.passwordFile, options.dataDir);
  const database = options.database ?? 'tectonic';
  const log = options.log ?? (() => {});

  await stopStalePostgres(options.dataDir, log);

  const pg = new EmbeddedPostgres({
    databaseDir: options.dataDir,
    user,
    password,
    port: options.port,
    persistent: true,
    onLog: (message: string) => {
      const line = String(message).trim();
      if (line && !/^\s*$/.test(line)) log(line);
    },
    onError: (error: unknown) => log(`error: ${String(error).trim()}`),
  });

  const fresh = !existsSync(path.join(options.dataDir, 'PG_VERSION'));
  if (fresh) {
    log(`initialising new data directory ${options.dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch (error) {
    if (!/already exists/.test(String(error))) throw error;
  }

  const pidFile = path.join(options.dataDir, 'postmaster.pid');
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').split('\n')[0]) : null;

  return {
    url: databaseUrl(options.port, password, user, database),
    maskedUrl: databaseUrl(options.port, '***', user, database),
    pid: Number.isFinite(pid) ? pid : null,
    stop: () => pg.stop(),
  };
}
