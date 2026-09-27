import { createDb, redact } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seedDatabase } from './seed.ts';

const [command, ...flags] = process.argv.slice(2);
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. For a running dev stack: eval "$(bun run --silent dev:env)"');
  process.exit(2);
}

switch (command) {
  case 'migrate': {
    await runMigrations(url);
    console.log(`Migrations applied to ${redact(url)}`);
    break;
  }
  case 'seed': {
    const handle = createDb(url, { max: 2 });
    try {
      const result = await seedDatabase(handle.db, { reset: flags.includes('--reset') });
      console.log(result.seeded ? `Seeded ${result.projects} projects / ${result.tasks} tasks` : 'Database already has data; nothing seeded');
    } finally {
      await handle.close();
    }
    break;
  }
  default:
    console.error('Usage: bun src/cli.ts <migrate|seed> [--reset]');
    process.exit(2);
}
