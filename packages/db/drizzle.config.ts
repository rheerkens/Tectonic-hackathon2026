import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://tectonic:tectonic@127.0.0.1:5432/tectonic',
  },
  strict: true,
  verbose: false,
});
