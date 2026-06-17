# Playwright Website Control Plane Plan

## 1) Objective

Build a Docker-deployable Playwright website POC that owns its own execution cadence without GitHub Actions, host cron, or a scheduler container.

The repo already has the core pipeline:

```txt
Playwright website tests
  -> custom DB reporter
  -> PostgreSQL run/result tables
  -> DB-to-Allure exporter
  -> generated static Allure report
```

The next step is a long-running Node/TypeScript control-plane worker that repeatedly runs that pipeline and a platform-routed UI service that serves the generated Allure report.

## 2) Resolved Design Decisions

- Deployment target: single-host Dokploy/Coolify Compose POC.
- Database: external hosted PostgreSQL, supplied through platform-injected `DATABASE_URL`.
- Scheduling model: app-owned fixed-delay loop, not cron.
- First cycle: run immediately after successful startup migration.
- Interval: `CONTROL_PLANE_INTERVAL_MS`, minimum `60000`, default `900000`.
- Migration behavior: run `pnpm run db:migrate` once at startup; exit non-zero if it fails.
- Cycle failure behavior: log failures and continue to the next fixed-delay cycle.
- Test failure behavior: still generate/export the Allure report, because failed tests are website run data.
- Report scope: export all DB runs, forever; no retention or deletion in this POC.
- Report publishing: direct `allure generate --clean` into the report directory is acceptable for the POC.
- Report serving: only the report UI service exposes a routeable container port for Dokploy/Coolify.
- Worker serving: control plane exposes no HTTP port.
- Locking: run exactly one control-plane replica; advisory locking is deferred.
- Alerting: defer Google Chat/failure alerts until the core loop, DB persistence, and report UI are stable.
- Artifacts: do not persist `test-results` in deployment until the DB Allure exporter supports attachments.
- Docker build: use a Playwright base image and install all dependencies, including devDependencies.

## 3) Target Runtime Architecture

```txt
Dokploy / Coolify Compose app
├─ control-plane worker
│  ├─ loads env
│  ├─ runs DB migration once
│  ├─ runs one website cycle immediately
│  ├─ waits fixed delay after each cycle completes
│  ├─ runs DB-only Playwright website suite
│  ├─ exports all DB runs to Allure result JSON
│  └─ generates static Allure report
│
├─ report-ui service
│  ├─ serves generated Allure report files
│  └─ exposes only the UI port for platform routing
│
└─ external hosted PostgreSQL
   └─ stores test_runs and test_results
```

## 4) Implementation Scope

### In Scope

- Add `scripts/control-plane.ts`.
- Add a dedicated DB-only Playwright website config.
- Update `test:website:db` to use the dedicated website config.
- Split DB Allure scripts into reusable all-runs steps.
- Add `control-plane` package script.
- Add `Dockerfile` for the control-plane image.
- Add `docker-compose.deploy.yml` for Dokploy/Coolify deployment.
- Add `.dockerignore` to keep generated artifacts and secrets out of image builds.
- Update `.env.example` with the new control-plane and target URL settings.
- Update docs/plan to use `DATABASE_URL`, not `PW_DB_URL`.

### Out Of Scope For This Iteration

- Google Chat alerts.
- Postgres advisory locks for multiple workers.
- Atomic report directory swaps.
- Retention cleanup for DB rows or generated report data.
- Persisting Playwright trace/video/screenshot artifacts in deployment.
- Attaching traces/screenshots/videos to DB-generated Allure results.
- Separate privileged migration database URL.
- Explicit DB SSL code unless the hosted provider connection string fails in practice.

## 5) File-Level Plan

### `scripts/control-plane.ts`

Responsibilities:

- Optionally load `.env` for local execution.
- Parse `CONTROL_PLANE_INTERVAL_MS`, defaulting to `900000`.
- Reject intervals below `60000`.
- Run `pnpm run db:migrate` once at startup.
- Run the first cycle immediately.
- Use a fixed-delay loop: wait only after a cycle completes.
- Run `pnpm run test:website:db`.
- Run DB Allure export/generation even if the Playwright command exits non-zero.
- Log each cycle start, finish, and failure.
- Continue after per-cycle failures.
- Handle `SIGTERM`/`SIGINT`, stop scheduling new cycles, terminate active child process, and exit.

Important behavior:

- Startup migration failure is fatal.
- Test assertion failure is not fatal to the worker.
- Allure export/generation failure is logged, then the worker continues after the interval.

### Dedicated Website Playwright Config

Add a config such as `playwright.website.config.ts`.

Configuration intent:

- Test directory: `./tests`.
- Spec selection lives in the config, not in `package.json`.
- Include the current website specs:
  - `tests/website/homepage.website.spec.ts`
  - `tests/website/critical-paths.website.spec.ts`
- Reporter list: `line` plus `./reporters/db-reporter.ts` only.
- Base URL: `process.env.TARGET_BASE_URL ?? 'https://www.mmdc.mcl.edu.ph/'`.
- Retries: `0`.
- Workers: `1`.
- Project: `chromium-core` only.
- Browser/device: Desktop Chrome.
- Trace behavior can remain failure-oriented, but deployment should not persist `test-results` yet.

### `package.json`

Update scripts to keep existing behavior but make steps reusable:

```json
{
  "test:website:db": "playwright test --config=playwright.website.config.ts",
  "allure:from-db": "tsx scripts/allure-from-db.ts",
  "allure:generate:db": "node scripts/allure.cjs generate ./allure-results-db -o ./allure-report-db --clean",
  "allure:db": "pnpm run allure:from-db && pnpm run allure:generate:db",
  "control-plane": "tsx scripts/control-plane.ts"
}
```

Do not add latest-run package aliases in this iteration because the selected report behavior is all runs forever.

### `docker-compose.deploy.yml`

Deployment compose shape:

- No PostgreSQL service.
- `DATABASE_URL` is required and supplied by Dokploy/Coolify environment variables.
- `control-plane` builds from the repo Dockerfile.
- `control-plane` runs `pnpm run control-plane`.
- `report-ui` serves the generated report directory.
- Only `report-ui` exposes a UI port for platform routing.
- Use named volumes to share generated report output between services.
- Do not use host port mappings.

Conceptual shape:

```yaml
services:
  control-plane:
    build: .
    restart: unless-stopped
    command: pnpm run control-plane
    environment:
      DATABASE_URL: ${DATABASE_URL}
      PW_DB_ENABLED: "true"
      PW_DB_REPORTER_STRICT: "false"
      PW_RUN_ENV: production
      TARGET_BASE_URL: ${TARGET_BASE_URL:-https://www.mmdc.mcl.edu.ph/}
      CONTROL_PLANE_INTERVAL_MS: ${CONTROL_PLANE_INTERVAL_MS:-900000}
    volumes:
      - allure-results-db:/app/allure-results-db
      - allure-report-db:/app/allure-report-db

  report-ui:
    image: nginx:alpine
    restart: unless-stopped
    expose:
      - "80"
    volumes:
      - allure-report-db:/usr/share/nginx/html:ro

volumes:
  allure-results-db:
  allure-report-db:
```

The static server image is an implementation detail. The deployment contract is that the UI service serves the generated Allure files on its container UI port and lets Dokploy/Coolify own public routing, domain, and TLS.

### `Dockerfile`

Use a Playwright base image compatible with the installed Playwright version.

The image should:

- Enable Corepack/pnpm.
- Copy `package.json` and `pnpm-lock.yaml` first for install caching.
- Run `pnpm install --frozen-lockfile` with all dependencies.
- Copy the repo source.
- Use `/app` as the workdir.
- Let Compose provide the command.

Do not use production-only dependency pruning because this runtime needs Playwright, `tsx`, TypeScript, and Allure tooling.

### `.dockerignore`

Add ignores for generated/local files, including:

- `.env`
- `node_modules/`
- `.docker/postgres-data/`
- `allure-results/`
- `allure-report/`
- `allure-results-db/`
- `allure-report-db/`
- `playwright-report/`
- `test-results/`
- `repomix-output.xml`

### `.env.example`

Document the new runtime knobs:

```bash
DATABASE_URL=postgres://test:test@localhost:5432/playwright
PW_DB_ENABLED=true
PW_DB_REPORTER_STRICT=false
PW_RUN_ENV=local
TARGET_BASE_URL=https://www.mmdc.mcl.edu.ph/
CONTROL_PLANE_INTERVAL_MS=900000
```

`DATABASE_URL` remains the canonical DB variable. Do not use `PW_DB_URL`.

## 6) Verification Plan

### Local Script Verification

Run migrations:

```bash
pnpm run db:migrate
```

Run the DB-only website suite:

```bash
pnpm run test:website:db
```

Generate the DB-backed Allure report:

```bash
pnpm run allure:db
```

Run the control plane locally long enough to observe the immediate first cycle:

```bash
pnpm run control-plane
```

Expected results:

- `test_runs` receives a new row per website cycle.
- `test_results` receives rows for each website test result.
- `allure-results-db/` is regenerated from all DB runs.
- `allure-report-db/` is regenerated from DB-exported Allure results.
- A failed Playwright test still results in report generation.

### Deployment Verification

Build and start the deployment compose stack through Dokploy/Coolify or equivalent Compose execution:

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

Expected results:

- `control-plane` starts, runs migrations, and immediately starts one cycle.
- `control-plane` has no routeable public port.
- `report-ui` exposes only its UI port for platform routing.
- The routed report URL serves the generated Allure dashboard after the first cycle completes.
- Restarting the worker does not require manual DB repair.

### Database Verification Queries

```sql
SELECT id, status, started_at, finished_at, total, passed, failed, skipped, timed_out, flaky
FROM test_runs
ORDER BY started_at DESC
LIMIT 5;
```

```sql
SELECT run_id, project, file, title, status, duration_ms, retry
FROM test_results
ORDER BY finished_at DESC
LIMIT 20;
```

## 7) Acceptance Criteria

- `PLAN.MD` and README no longer describe cron as the target scheduler for this POC path.
- `DATABASE_URL` is the only documented DB connection string for the app/reporting path.
- `pnpm run test:website:db` runs the dedicated DB-only website config.
- `pnpm run allure:db` exports all DB runs and regenerates the DB-backed Allure report.
- `pnpm run control-plane` runs migration once, runs a cycle immediately, then repeats on fixed delay.
- A failed Playwright website command does not prevent DB Allure export/generation from being attempted.
- `docker-compose.deploy.yml` uses external Postgres and does not define a Postgres container.
- `docker-compose.deploy.yml` uses named volumes for generated report data.
- Only the report UI service exposes a routeable port.
- The deployment notes state that exactly one control-plane replica should run.
- Retention, advisory locking, atomic publishing, alerts, and attachments are explicitly documented as follow-ups.

## 8) Follow-Up Hardening

Add these only after the POC loop is working:

- Postgres advisory lock to protect against duplicate workers.
- Report generation into a temporary directory followed by atomic publish/swap.
- Retention policy for DB rows and generated Allure data.
- Google Chat failure-only alerting.
- Trace/screenshot/video attachment export from DB paths into Allure results.
- Separate migration and app DB credentials.
- Explicit DB SSL options if the hosted provider requires code-level SSL configuration.
- Optional local override compose file for local report UI ports.
