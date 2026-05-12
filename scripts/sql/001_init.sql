CREATE TABLE IF NOT EXISTS test_runs (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  timed_out integer NOT NULL DEFAULT 0,
  flaky integer NOT NULL DEFAULT 0,
  ci boolean NOT NULL DEFAULT false,
  run_env text,
  branch text,
  commit_sha text,
  build_url text,
  triggered_by text,
  base_url text
);

CREATE TABLE IF NOT EXISTS test_results (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  project text,
  file text,
  title text NOT NULL,
  full_title text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  expected_status text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  retry integer NOT NULL DEFAULT 0,
  browser text,
  error_message text,
  error_stack text,
  trace_path text,
  video_path text,
  screenshot_path text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_runs_started_at_desc
  ON test_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_runs_status_started_at_desc
  ON test_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_results_run_id
  ON test_results (run_id);

CREATE INDEX IF NOT EXISTS idx_test_results_status_project
  ON test_results (status, project);

CREATE INDEX IF NOT EXISTS idx_test_results_file_title
  ON test_results (file, title);
