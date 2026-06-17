import { randomUUID } from 'node:crypto';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { eq } from 'drizzle-orm';
import { createDbConnection, type DbConnection } from '../db/client';
import { testResults, testRuns } from '../db/schema';

type Counters = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  flaky: number;
};

type ReporterOptions = {
  enabled?: boolean;
  strict?: boolean;
  connectionString?: string;
};

function asBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeStatus(status: TestResult['status']): string {
  if (status === 'timedOut') return 'timed_out';
  return status;
}

function resolveBuildUrl(): string | null {
  if (process.env.BUILD_URL) return process.env.BUILD_URL;
  if (
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
  ) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }
  return null;
}

function pickAttachmentPath(result: TestResult, matcher: (name: string) => boolean): string | null {
  const match = result.attachments.find((attachment) => matcher(attachment.name));
  return match?.path ?? null;
}

export default class DbReporter implements Reporter {
  private readonly enabled: boolean;
  private readonly strict: boolean;
  private readonly connectionString: string;
  private readonly counters: Counters = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    timedOut: 0,
    flaky: 0,
  };
  private readonly startTimesByAttempt = new Map<string, Date>();
  private readonly errors: Error[] = [];
  private runId: string = randomUUID();
  private runStartedAt: Date = new Date();
  private connection: DbConnection | null = null;
  private baseUrl: string | null = null;
  private rootSuite: Suite | null = null;
  private projectToBrowser = new Map<string, string | null>();

  constructor(options: ReporterOptions = {}) {
    this.enabled = options.enabled ?? asBoolean(process.env.PW_DB_ENABLED, false);
    this.strict = options.strict ?? asBoolean(process.env.PW_DB_REPORTER_STRICT, false);
    this.connectionString = options.connectionString ?? process.env.DATABASE_URL ?? '';
  }

  private addError(message: string, cause?: unknown) {
    const formatted = cause instanceof Error ? `${message}: ${cause.message}` : message;
    this.errors.push(new Error(formatted));
    // Keep terminal output minimal but visible when DB persistence fails.
    console.error(`[db-reporter] ${formatted}`);
  }

  private attemptKey(test: TestCase, result: TestResult): string {
    return `${test.id}:${result.retry}`;
  }

  private resolveProjectName(test: TestCase, result: TestResult): string | null {
    const resultAny = result as unknown as { projectName?: string };
    if (resultAny.projectName) return resultAny.projectName;

    const testAny = test as unknown as {
      parent?: {
        project?: () => { name?: string };
      };
    };
    const project = testAny.parent?.project?.();
    return project?.name ?? null;
  }

  private resolveBrowserName(projectName: string | null): string | null {
    if (!projectName) return null;
    return this.projectToBrowser.get(projectName) ?? null;
  }

  private computeFinalCounters(): Counters {
    const counters: Counters = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      flaky: 0,
    };

    if (!this.rootSuite) return counters;

    for (const test of this.rootSuite.allTests()) {
      counters.total += 1;
      const outcome = test.outcome();
      const lastResult = test.results[test.results.length - 1];

      if (outcome === 'skipped') {
        counters.skipped += 1;
        continue;
      }

      if (outcome === 'flaky') {
        counters.flaky += 1;
      }

      if (lastResult?.status === 'timedOut') counters.timedOut += 1;
      else if (lastResult?.status === 'passed' && outcome !== 'flaky') counters.passed += 1;
      else if (lastResult?.status === 'failed' || lastResult?.status === 'interrupted') {
        counters.failed += 1;
      }
    }

    return counters;
  }

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    this.rootSuite = suite;
    this.runStartedAt = new Date();

    const inferredBase =
      (config.projects[0]?.use?.baseURL as string | undefined) ??
      process.env.TARGET_BASE_URL ??
      null;
    this.baseUrl = inferredBase;

    for (const project of config.projects) {
      const browserName = (project.use?.browserName as string | undefined) ?? null;
      this.projectToBrowser.set(project.name, browserName);
    }

    if (!this.enabled) return;
    if (!this.connectionString) {
      this.addError('PW_DB_ENABLED=true but DATABASE_URL is missing');
      return;
    }

    try {
      this.connection = createDbConnection(this.connectionString);

      await this.connection.db.insert(testRuns).values({
        id: this.runId,
        startedAt: this.runStartedAt,
        status: 'running',
        ci: asBoolean(process.env.CI, false),
        runEnv: process.env.PW_RUN_ENV ?? null,
        branch: process.env.GITHUB_REF_NAME ?? process.env.BRANCH_NAME ?? null,
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        buildUrl: resolveBuildUrl(),
        triggeredBy: process.env.GITHUB_ACTOR ?? process.env.USERNAME ?? process.env.USER ?? null,
        baseUrl: this.baseUrl,
      });
    } catch (error) {
      this.addError('Failed to initialize db reporter', error);
    }
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.startTimesByAttempt.set(this.attemptKey(test, result), result.startTime);
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (!this.enabled || !this.connection) {
      this.startTimesByAttempt.delete(this.attemptKey(test, result));
      return;
    }

    const startedAt = this.startTimesByAttempt.get(this.attemptKey(test, result)) ?? result.startTime;
    const finishedAt = new Date(startedAt.getTime() + result.duration);
    const projectName = this.resolveProjectName(test, result);
    const browserName = this.resolveBrowserName(projectName);
    const tracePath = pickAttachmentPath(result, (name) => name.toLowerCase().includes('trace'));
    const videoPath = pickAttachmentPath(result, (name) => name.toLowerCase().includes('video'));
    const screenshotPath = pickAttachmentPath(result, (name) =>
      name.toLowerCase().includes('screenshot')
    );
    const tags = ((test as unknown as { tags?: string[] }).tags ?? []).map((tag) => tag.toString());

    try {
      await this.connection.db.insert(testResults).values({
        id: randomUUID(),
        runId: this.runId,
        project: projectName,
        file: test.location.file,
        title: test.title,
        fullTitle: test.titlePath().join(' > '),
        tags,
        status: normalizeStatus(result.status),
        expectedStatus: normalizeStatus(test.expectedStatus),
        durationMs: result.duration,
        retry: result.retry,
        browser: browserName,
        errorMessage: result.error?.message ?? null,
        errorStack: result.error?.stack ?? null,
        tracePath,
        videoPath,
        screenshotPath,
        startedAt,
        finishedAt,
      });
    } catch (error) {
      this.addError(`Failed to persist test result for "${test.title}"`, error);
    } finally {
      this.startTimesByAttempt.delete(this.attemptKey(test, result));
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const finalCounters = this.computeFinalCounters();
    this.counters.total = finalCounters.total;
    this.counters.passed = finalCounters.passed;
    this.counters.failed = finalCounters.failed;
    this.counters.skipped = finalCounters.skipped;
    this.counters.timedOut = finalCounters.timedOut;
    this.counters.flaky = finalCounters.flaky;

    if (this.enabled && this.connection) {
      try {
        await this.connection.db
          .update(testRuns)
          .set({
            finishedAt: new Date(),
            status: result.status,
            total: this.counters.total,
            passed: this.counters.passed,
            failed: this.counters.failed,
            skipped: this.counters.skipped,
            timedOut: this.counters.timedOut,
            flaky: this.counters.flaky,
          })
          .where(eq(testRuns.id, this.runId));
      } catch (error) {
        this.addError('Failed to finalize test run row', error);
      }
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch (error) {
        this.addError('Failed to close database client', error);
      } finally {
        this.connection = null;
      }
    }

    if (this.strict && this.errors.length > 0) {
      throw new Error(
        `DB reporter strict mode failed with ${this.errors.length} persistence error(s).`
      );
    }
  }
}
