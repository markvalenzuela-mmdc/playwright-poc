import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDbConnection } from '../db/client';

const migrationsDir = path.join(process.cwd(), 'drizzle');

function migrationHash(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function migrationStatements(content: string) {
  return content
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${error.message}: ${cause.message}`;

  return error.message;
}

async function main() {
  const connection = createDbConnection();

  try {
    await connection.db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        "id" serial PRIMARY KEY,
        "hash" text NOT NULL UNIQUE,
        "created_at" bigint NOT NULL
      )
    `));

    const appliedRows = await connection.db.execute<{ hash: string }>(
      sql.raw('SELECT "hash" FROM "__drizzle_migrations"')
    );
    const applied = new Set(appliedRows.rows.map((row) => row.hash));
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const hash = migrationHash(content);
      if (applied.has(hash)) continue;

      await connection.db.transaction(async (tx) => {
        for (const statement of migrationStatements(content)) {
          await tx.execute(sql.raw(statement));
        }
        await tx.execute(
          sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (${hash}, ${Date.now()})`
        );
      });
      console.log(`Applied migration ${file}.`);
    }

    console.log('Database migrations applied successfully.');
  } finally {
    await connection.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`Failed to apply database migrations: ${formatError(error)}`);
  process.exit(1);
});
