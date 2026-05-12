const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { loadEnvFile } = require('node:process');
const { Client } = require('pg');

try {
  loadEnvFile('.env');
} catch {
  // Optional: allow manual env-only execution.
}

function parseArgs(argv) {
  const parsed = {
    outputDir: path.join(process.cwd(), 'allure-results-db'),
    clean: true,
    allRuns: true,
    runId: null,
    limitRuns: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--output-dir' && argv[i + 1]) {
      parsed.outputDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--run-id' && argv[i + 1]) {
      parsed.runId = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--all-runs') {
      parsed.allRuns = true;
      continue;
    }
    if (token === '--latest') {
      parsed.allRuns = false;
      parsed.limitRuns = 1;
      continue;
    }
    if (token === '--limit-runs' && argv[i + 1]) {
      parsed.limitRuns = Math.max(1, Number.parseInt(argv[i + 1], 10) || 1);
      i += 1;
      continue;
    }
    if (token === '--no-clean') {
      parsed.clean = false;
    }
  }

  return parsed;
}

function hashId(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function toMs(value) {
  if (!value) return Date.now();
  return new Date(value).getTime();
}

function toAllureStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed') return 'failed';
  if (status === 'timed_out') return 'broken';
  if (status === 'interrupted') return 'broken';
  return 'unknown';
}

function toLabel(name, value) {
  return { name, value: String(value) };
}

function cleanAndCreateDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  for (const entry of fs.readdirSync(dirPath)) {
    const target = path.join(dirPath, entry);
    if (fs.statSync(target).isFile()) {
      fs.rmSync(target);
    }
  }
}

function normalizeTags(tagsValue) {
  if (!Array.isArray(tagsValue)) return [];
  return tagsValue.map((tag) => String(tag).replace(/^@/, ''));
}

function deriveSuiteParts(fullTitle, filePath) {
  const parts = String(fullTitle)
    .split(' > ')
    .map((piece) => piece.trim())
    .filter(Boolean);

  const fileName = path.basename(filePath || '');
  const withoutFile = parts.filter((part) => part !== fileName);
  const subSuite = withoutFile.length > 1 ? withoutFile[withoutFile.length - 2] : null;
  return { fileName, subSuite };
}

async function resolveRunIds(client, args) {
  if (args.runId) return [args.runId];

  if (args.allRuns) {
    const { rows } = await client.query(
      `
        SELECT id
        FROM test_runs
        ORDER BY started_at DESC
      `
    );
    return rows.map((row) => row.id);
  }

  const { rows } = await client.query(
    `
      SELECT id
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT $1
    `,
    [args.limitRuns]
  );
  return rows.map((row) => row.id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connectionString =
    process.env.PW_DB_URL ||
    process.env.DATABASE_URL ||
    'postgres://test:test@localhost:5432/playwright';

  const client = new Client({ connectionString });

  try {
    await client.connect();

    const runIds = await resolveRunIds(client, args);
    if (runIds.length === 0) {
      console.log('No test runs found in database.');
      return;
    }

    if (args.clean) cleanAndCreateDirectory(args.outputDir);
    else fs.mkdirSync(args.outputDir, { recursive: true });

    const { rows } = await client.query(
      `
        SELECT
          tr.id,
          tr.run_id,
          tr.project,
          tr.file,
          tr.title,
          tr.full_title,
          tr.tags,
          tr.status,
          tr.expected_status,
          tr.duration_ms,
          tr.retry,
          tr.browser,
          tr.error_message,
          tr.error_stack,
          tr.trace_path,
          tr.video_path,
          tr.screenshot_path,
          tr.started_at,
          tr.finished_at,
          r.status AS run_status,
          r.started_at AS run_started_at,
          r.finished_at AS run_finished_at,
          r.run_env
        FROM test_results tr
        JOIN test_runs r ON r.id = tr.run_id
        WHERE tr.run_id = ANY($1::uuid[])
        ORDER BY tr.finished_at ASC
      `,
      [runIds]
    );

    for (const row of rows) {
      const uuid = randomUUID();
      const historySeed = `${row.id}|${row.run_id}|${row.started_at || ''}|${row.finished_at || ''}`;
      const historyId = hashId(historySeed);
      const status = toAllureStatus(row.status);
      const start = toMs(row.started_at);
      const stop = toMs(row.finished_at) || start + (row.duration_ms || 0);
      const { fileName, subSuite } = deriveSuiteParts(row.full_title, row.file);
      const tags = normalizeTags(row.tags);

      const startedAtIso = row.started_at ? new Date(row.started_at).toISOString() : 'unknown-time';

      const labels = [
        toLabel('language', 'javascript'),
        toLabel('framework', 'playwright'),
        toLabel('package', fileName || 'unknown-file'),
        toLabel('parentSuite', row.project || 'unknown-project'),
        toLabel('suite', fileName || 'unknown-suite'),
        toLabel('host', process.env.COMPUTERNAME || 'db-import'),
        toLabel('thread', `run-${row.run_id}`),
      ];

      if (subSuite) labels.push(toLabel('subSuite', subSuite));
      for (const tag of tags) labels.push(toLabel('tag', tag));

      const parameters = [
        { name: 'Project', value: String(row.project || 'unknown') },
        { name: 'Run ID', value: String(row.run_id) },
        { name: 'Started At', value: startedAtIso },
        { name: 'Retry', value: String(row.retry || 0) },
      ];

      if (row.browser) parameters.push({ name: 'Browser', value: String(row.browser) });
      if (row.run_env) parameters.push({ name: 'Environment', value: String(row.run_env) });

      const statusDetails = {};
      if (row.error_message) statusDetails.message = String(row.error_message);
      if (row.error_stack) statusDetails.trace = String(row.error_stack);

      const result = {
        uuid,
        historyId,
        testCaseId: historyId,
        fullName: `${row.file || 'unknown-file'}::${row.full_title || row.title}::run=${row.run_id}::started=${startedAtIso}`,
        name: `${row.title} [${startedAtIso}]`,
        status,
        statusDetails,
        stage: 'finished',
        description: `Imported from PostgreSQL run ${row.run_id}`,
        steps: [],
        attachments: [],
        parameters,
        labels,
        links: [],
        start,
        stop,
      };

      const filePath = path.join(args.outputDir, `${uuid}-result.json`);
      fs.writeFileSync(filePath, JSON.stringify(result));
    }

    const executor = {
      name: 'PostgreSQL Import',
      type: 'custom',
      reportName: `DB Imported Runs (${runIds.length})`,
      buildName: `Run import ${new Date().toISOString()}`,
    };
    fs.writeFileSync(path.join(args.outputDir, 'executor.json'), JSON.stringify(executor, null, 2));

    console.log(
      `Exported ${rows.length} test results from ${runIds.length} run(s) to ${args.outputDir}`
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed to export Allure results from database: ${error.message}`);
  process.exit(1);
});
