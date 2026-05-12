import { randomUUID } from 'node:crypto';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

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

type DbClient = {
  connect(): Promise<unknown>;
  query(text: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
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
  private client: DbClient | null = null;
  private baseUrl: string | null = null;
  private rootSuite: Suite | null = null;
  private projectToBrowser = new Map<string, string | null>();

  constructor(options: ReporterOptions = {}) {
    this.enabled = options.enabled ?? asBoolean(process.env.PW_DB_ENABLED, false);
    this.strict = options.strict ?? asBoolean(process.env.PW_DB_REPORTER_STRICT, false);
    this.connectionString = options.connectionString ?? process.env.PW_DB_URL ?? '';
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
      this.addError('PW_DB_ENABLED=true but PW_DB_URL is missing');
      return;
    }

    try {
      const pg = await import('pg');
      const PgClient = pg.Client;
      this.client = new PgClient({ connectionString: this.connectionString });
      await this.client.connect();

      await this.client.query(
        `
          INSERT INTO test_runs (
            id, started_at, status, total, passed, failed, skipped, timed_out, flaky,
            ci, run_env, branch, commit_sha, build_url, triggered_by, base_url
          ) VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          this.runId,
          this.runStartedAt,
          'running',
          asBoolean(process.env.CI, false),
          process.env.PW_RUN_ENV ?? null,
          process.env.GITHUB_REF_NAME ?? process.env.BRANCH_NAME ?? null,
          process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
          resolveBuildUrl(),
          process.env.GITHUB_ACTOR ?? process.env.USERNAME ?? process.env.USER ?? null,
          this.baseUrl,
        ]
      );
    } catch (error) {
      this.addError('Failed to initialize db reporter', error);
    }
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.startTimesByAttempt.set(this.attemptKey(test, result), result.startTime);
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (!this.enabled || !this.client) {
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
      await this.client.query(
        `
          INSERT INTO test_results (
            id, run_id, project, file, title, full_title, tags,
            status, expected_status, duration_ms, retry, browser,
            error_message, error_stack, trace_path, video_path, screenshot_path,
            started_at, finished_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19
          )
        `,
        [
          randomUUID(),
          this.runId,
          projectName,
          test.location.file,
          test.title,
          test.titlePath().join(' > '),
          tags,
          normalizeStatus(result.status),
          normalizeStatus(test.expectedStatus),
          result.duration,
          result.retry,
          browserName,
          result.error?.message ?? null,
          result.error?.stack ?? null,
          tracePath,
          videoPath,
          screenshotPath,
          startedAt,
          finishedAt,
        ]
      );
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

    if (this.enabled && this.client) {
      try {
        await this.client.query(
          `
            UPDATE test_runs
            SET
              finished_at = $2,
              status = $3,
              total = $4,
              passed = $5,
              failed = $6,
              skipped = $7,
              timed_out = $8,
              flaky = $9
            WHERE id = $1
          `,
          [
            this.runId,
            new Date(),
            result.status,
            this.counters.total,
            this.counters.passed,
            this.counters.failed,
            this.counters.skipped,
            this.counters.timedOut,
            this.counters.flaky,
          ]
        );
      } catch (error) {
        this.addError('Failed to finalize test run row', error);
      }
    }

    if (this.client) {
      try {
        await this.client.end();
      } catch (error) {
        this.addError('Failed to close database client', error);
      } finally {
        this.client = null;
      }
    }

    if (this.strict && this.errors.length > 0) {
      throw new Error(
        `DB reporter strict mode failed with ${this.errors.length} persistence error(s).`
      );
    }
  }
}
