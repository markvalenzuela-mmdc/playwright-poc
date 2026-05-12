const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('node:process');
const { Client } = require('pg');

try {
  loadEnvFile('.env');
} catch {
  // Optional: allow manual env-only execution.
}

const connectionString =
  process.env.PW_DB_URL ||
  process.env.DATABASE_URL ||
  'postgres://test:test@localhost:5432/playwright';

const sqlPath = path.join(__dirname, 'sql', '001_init.sql');

async function main() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(sql);
    console.log('Database schema initialized successfully.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed to initialize database schema: ${error.message}`);
  process.exit(1);
});
