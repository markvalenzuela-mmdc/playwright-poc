import { loadEnvFile } from 'node:process';
import { defineConfig } from 'drizzle-kit';

try {
  loadEnvFile('.env');
} catch {
  // Optional: allow running even when .env is absent.
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/playwright',
  },
});
