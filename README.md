# Playwright + Docker + Allure Run Guide

This project uses Playwright tests, PostgreSQL, Drizzle migrations, a long-running control-plane worker, and Allure reports exported from DB-backed runs.

## Environment

Copy `.env.example` to `.env` for local development and adjust values as needed.

`DATABASE_URL` is the canonical application connection string. Use it for both local Docker PostgreSQL and hosted PostgreSQL.

Local Docker PostgreSQL also reads these container-only variables:

```bash
POSTGRES_USER=test
POSTGRES_PASSWORD=test
POSTGRES_DB=playwright
```

DB-backed Playwright reporting is controlled by:

```bash
PW_DB_ENABLED=true
PW_DB_REPORTER_STRICT=false
PW_RUN_ENV=local
```

Control-plane website testing is controlled by:

```bash
TARGET_BASE_URL=https://www.mmdc.mcl.edu.ph/
CONTROL_PLANE_INTERVAL_MS=900000
```

`CONTROL_PLANE_INTERVAL_MS` must be at least `60000`.

For hosted PostgreSQL, set `DATABASE_URL` to the provider connection string before running migrations, tests, or DB report exports. The role used for `pnpm run db:migrate` must be allowed to create tables and indexes.

## Local Run Flow

1. Start PostgreSQL container:

```bash
pnpm run db:up
```

2. Apply Drizzle migrations:

```bash
pnpm run db:migrate
```

3. Run website tests with DB persistence:

```bash
pnpm run test:website:db
```

4. Export DB runs and generate DB-based Allure report:

```bash
pnpm run allure:db
```

5. Open the DB-based Allure report:

```bash
pnpm run allure:open:db
```

## Control Plane

The control plane owns the website test cadence without host cron or GitHub Actions as the runtime scheduler.

```bash
pnpm run control-plane
```

On startup it applies DB migrations once, runs one website test cycle immediately, then waits `CONTROL_PLANE_INTERVAL_MS` after each completed cycle before starting the next one. Playwright test failures are still exported to Allure so the generated dashboard shows failed website runs.

The website suite uses `playwright.website.config.ts`, which runs the DB reporter only and avoids generating Playwright HTML or direct Allure reporter artifacts on each scheduled run.

## Dokploy / Coolify Deploy Shape

Use `docker-compose.deploy.yml` for platform deployment. It assumes an external hosted PostgreSQL database and requires `DATABASE_URL` to be configured in the platform environment.

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

The deploy compose file starts:

- `control-plane`: worker-only service with no exposed ports.
- `report-ui`: static Allure report UI service exposing container port `80` for platform routing.

Run exactly one `control-plane` replica for this POC. Multiple replicas require a Postgres advisory lock, which is intentionally deferred.
