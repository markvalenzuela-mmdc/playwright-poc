import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { createDbConnection } from '../db/client';
import { testResults, testRuns } from '../db/schema';

type Args = {
  outputDir: string;
  clean: boolean;
  allRuns: boolean;
  runId: string | null;
  limitRuns: number;
};

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
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

function hashId(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

function toMs(value: Date | string | null): number {
  if (!value) return Date.now();
  return new Date(value).getTime();
}

function toAllureStatus(status: string): string {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed') return 'failed';
  if (status === 'timed_out') return 'broken';
  if (status === 'interrupted') return 'broken';
  return 'unknown';
}

function toLabel(name: string, value: unknown) {
  return { name, value: String(value) };
}

function cleanAndCreateDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  for (const entry of fs.readdirSync(dirPath)) {
    const target = path.join(dirPath, entry);
    if (fs.statSync(target).isFile()) {
      fs.rmSync(target);
    }
  }
}

function normalizeTags(tagsValue: unknown): string[] {
  if (!Array.isArray(tagsValue)) return [];
  return tagsValue.map((tag) => String(tag).replace(/^@/, ''));
}

function deriveSuiteParts(fullTitle: string, filePath: string | null) {
  const parts = String(fullTitle)
    .split(' > ')
    .map((piece) => piece.trim())
    .filter(Boolean);

  const fileName = path.basename(filePath || '');
  const withoutFile = parts.filter((part) => part !== fileName);
  const subSuite = withoutFile.length > 1 ? withoutFile[withoutFile.length - 2] : null;
  return { fileName, subSuite };
}

async function resolveRunIds(db: ReturnType<typeof createDbConnection>['db'], args: Args) {
  if (args.runId) return [args.runId];

  if (args.allRuns) {
    const rows = await db
      .select({ id: testRuns.id })
      .from(testRuns)
      .orderBy(desc(testRuns.startedAt));
    return rows.map((row) => row.id);
  }

  const rows = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .orderBy(desc(testRuns.startedAt))
    .limit(args.limitRuns);
  return rows.map((row) => row.id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connection = createDbConnection();

  try {
    const runIds = await resolveRunIds(connection.db, args);
    if (runIds.length === 0) {
      console.log('No test runs found in database.');
      return;
    }

    if (args.clean) cleanAndCreateDirectory(args.outputDir);
    else fs.mkdirSync(args.outputDir, { recursive: true });

    const rows = await connection.db
      .select({
        id: testResults.id,
        runId: testResults.runId,
        project: testResults.project,
        file: testResults.file,
        title: testResults.title,
        fullTitle: testResults.fullTitle,
        tags: testResults.tags,
        status: testResults.status,
        expectedStatus: testResults.expectedStatus,
        durationMs: testResults.durationMs,
        retry: testResults.retry,
        browser: testResults.browser,
        errorMessage: testResults.errorMessage,
        errorStack: testResults.errorStack,
        tracePath: testResults.tracePath,
        videoPath: testResults.videoPath,
        screenshotPath: testResults.screenshotPath,
        startedAt: testResults.startedAt,
        finishedAt: testResults.finishedAt,
        runStatus: testRuns.status,
        runStartedAt: testRuns.startedAt,
        runFinishedAt: testRuns.finishedAt,
        runEnv: testRuns.runEnv,
      })
      .from(testResults)
      .innerJoin(testRuns, eq(testRuns.id, testResults.runId))
      .where(inArray(testResults.runId, runIds))
      .orderBy(asc(testResults.finishedAt));

    for (const row of rows) {
      const uuid = randomUUID();
      const historySeed = `${row.id}|${row.runId}|${row.startedAt || ''}|${row.finishedAt || ''}`;
      const historyId = hashId(historySeed);
      const status = toAllureStatus(row.status);
      const start = toMs(row.startedAt);
      const stop = toMs(row.finishedAt) || start + (row.durationMs || 0);
      const { fileName, subSuite } = deriveSuiteParts(row.fullTitle, row.file);
      const tags = normalizeTags(row.tags);

      const startedAtIso = row.startedAt ? new Date(row.startedAt).toISOString() : 'unknown-time';

      const labels = [
        toLabel('language', 'javascript'),
        toLabel('framework', 'playwright'),
        toLabel('package', fileName || 'unknown-file'),
        toLabel('parentSuite', row.project || 'unknown-project'),
        toLabel('suite', fileName || 'unknown-suite'),
        toLabel('host', process.env.COMPUTERNAME || 'db-import'),
        toLabel('thread', `run-${row.runId}`),
      ];

      if (subSuite) labels.push(toLabel('subSuite', subSuite));
      for (const tag of tags) labels.push(toLabel('tag', tag));

      const parameters = [
        { name: 'Project', value: String(row.project || 'unknown') },
        { name: 'Run ID', value: String(row.runId) },
        { name: 'Started At', value: startedAtIso },
        { name: 'Retry', value: String(row.retry || 0) },
      ];

      if (row.browser) parameters.push({ name: 'Browser', value: String(row.browser) });
      if (row.runEnv) parameters.push({ name: 'Environment', value: String(row.runEnv) });

      const statusDetails: { message?: string; trace?: string } = {};
      if (row.errorMessage) statusDetails.message = String(row.errorMessage);
      if (row.errorStack) statusDetails.trace = String(row.errorStack);

      const result = {
        uuid,
        historyId,
        testCaseId: historyId,
        fullName: `${row.file || 'unknown-file'}::${row.fullTitle || row.title}::run=${row.runId}::started=${startedAtIso}`,
        name: `${row.title} [${startedAtIso}]`,
        status,
        statusDetails,
        stage: 'finished',
        description: `Imported from PostgreSQL run ${row.runId}`,
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
    await connection.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`Failed to export Allure results from database: ${error.message}`);
  process.exit(1);
});
