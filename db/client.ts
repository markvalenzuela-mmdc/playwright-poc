import { loadEnvFile } from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

try {
  loadEnvFile('.env');
} catch {
  // Optional: allow manual env-only execution.
}

export function resolveDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database access.');
  }

  return connectionString;
}

export function createDbConnection(connectionString = resolveDatabaseUrl()) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  return {
    db,
    close: () => pool.end(),
  };
}

export type DbConnection = ReturnType<typeof createDbConnection>;
