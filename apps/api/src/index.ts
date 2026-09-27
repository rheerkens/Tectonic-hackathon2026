import { createDb, runMigrations, waitForDatabase } from '@tectonic/db';
import { createApp } from './app.ts';
import { ConfigError, resolveConfig } from './config.ts';
import { createLogger } from './log.ts';

let config;
try {
  config = resolveConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[api] configuration error: ${error.message}`);
    process.exit(78); // EX_CONFIG
  }
  throw error;
}

const log = createLogger(config.productionLike ? 'info' : 'debug');

try {
  await waitForDatabase(config.databaseUrl);
  if (config.autoMigrate) {
    await runMigrations(config.databaseUrl);
    log.info('migrations applied');
  }
} catch (error) {
  log.error(`database unavailable: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(69); // EX_UNAVAILABLE
}

const handle = createDb(config.databaseUrl);
const { fetch, websocket } = createApp({ config, db: handle.db, log });

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch,
  websocket,
  development: !config.productionLike,
  idleTimeout: 120,
});

log.info(`listening on http://${server.hostname}:${server.port} (auth: ${config.authMode}, static: ${config.serveStatic ? 'on' : 'off'})`);

// When launched by `bun run dev`, exit if the launcher disappears so no orphaned
// API process survives a hard kill of the launcher.
const launcherPid = Number(process.env.DEV_LAUNCHER_PID);
if (launcherPid > 0) {
  setInterval(() => {
    if (process.ppid !== launcherPid) {
      log.warn('launcher process gone, shutting down');
      shutdown('orphaned');
    }
  }, 2_000);
}

let stopping = false;
async function shutdown(reason: string) {
  if (stopping) return;
  stopping = true;
  log.info(`shutting down (${reason})`);
  server.stop(true);
  await handle.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
