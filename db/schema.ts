import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const testRuns = pgTable(
  'test_runs',
  {
    id: uuid('id').primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull(),
    total: integer('total').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    timedOut: integer('timed_out').notNull().default(0),
    flaky: integer('flaky').notNull().default(0),
    ci: boolean('ci').notNull().default(false),
    runEnv: text('run_env'),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    buildUrl: text('build_url'),
    triggeredBy: text('triggered_by'),
    baseUrl: text('base_url'),
  },
  (table) => [
    index('idx_test_runs_started_at_desc').on(table.startedAt.desc()),
    index('idx_test_runs_status_started_at_desc').on(table.status, table.startedAt.desc()),
  ]
);

export const testResults = pgTable(
  'test_results',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    project: text('project'),
    file: text('file'),
    title: text('title').notNull(),
    fullTitle: text('full_title').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').notNull(),
    expectedStatus: text('expected_status').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    retry: integer('retry').notNull().default(0),
    browser: text('browser'),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    tracePath: text('trace_path'),
    videoPath: text('video_path'),
    screenshotPath: text('screenshot_path'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_test_results_run_id').on(table.runId),
    index('idx_test_results_status_project').on(table.status, table.project),
    index('idx_test_results_file_title').on(table.file, table.title),
  ]
);
