import path from 'node:path';
import { launch, stackStatus, stopStack } from './launcher.ts';
import { databaseUrl, loadPassword } from './postgres.ts';
import { assertProfile, localDir, resolveWorktree } from './worktree.ts';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args.shift()! : 'up';

function flag(name: string): boolean {
  const index = args.indexOf(name);
  if (index >= 0) {
    args.splice(index, 1);
    return true;
  }
  return false;
}
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) {
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
  }
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) {
    args.splice(args.indexOf(inline), 1);
    return inline.slice(name.length + 1);
  }
  return undefined;
}

const profile = option('--profile') ?? 'dev';
try {
  assertProfile(profile);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}

switch (command) {
  case 'up': {
    const resetDb = flag('--reset-db');
    const apiOnly = flag('--api-only');
    await launch({ profile, resetDb, apiOnly });
    break;
  }
  case 'stop': {
    const stopped = await stopStack({ profile });
    process.exitCode = stopped ? 0 : 1;
    break;
  }
  case 'status': {
    const info = await stackStatus({ profile });
    if (!info) {
      console.log(`No runtime information for profile "${profile}". Run: bun run dev`);
      process.exitCode = 1;
      break;
    }
    console.log(JSON.stringify(info, null, 2));
    process.exitCode = info.status === 'ready' ? 0 : 1;
    break;
  }
  case 'env': {
    // Shell-exportable environment for tools that need the running stack, e.g. drizzle-kit studio.
    const info = await stackStatus({ profile });
    if (!info || info.status !== 'ready') {
      console.error(`Dev stack for profile "${profile}" is not running. Start it with: bun run dev`);
      process.exitCode = 1;
      break;
    }
    // The password lives only in a 0600 file; it is read here for the caller's shell, not stored in runtime.json.
    const local = localDir((await resolveWorktree()).root, profile);
    const password = loadPassword(path.join(local, 'pg-password'), info.paths.postgresData);
    console.log(`export DATABASE_URL=${JSON.stringify(databaseUrl(info.ports.postgres, password))}`);
    for (const [key, value] of Object.entries(info.env)) console.log(`export ${key}=${JSON.stringify(value)}`);
    console.log(`export WEB_URL=${JSON.stringify(info.urls.web)}`);
    console.log(`export API_URL=${JSON.stringify(info.urls.api)}`);
    break;
  }
  default:
    console.error(`Unknown command "${command}". Usage: bun tools/dev/src/cli.ts [up|stop|status|env] [--profile name] [--reset-db] [--api-only]`);
    process.exitCode = 2;
}

// `up` keeps running until signalled; every other command ends here with an explicit code.
if (command !== 'up') process.exit(Number(process.exitCode ?? 0));
