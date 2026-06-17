# Playwright + Docker + Allure Run Guide

This project uses Playwright tests, PostgreSQL, Drizzle migrations, and Allure reports exported from DB-backed runs.

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

For hosted PostgreSQL, set `DATABASE_URL` to the provider connection string before running migrations, tests, or DB report exports. The role used for `pnpm run db:migrate` must be allowed to create tables and indexes.

## Run Flow

1. Start PostgreSQL container:

```bash
pnpm run db:up
```

2. Apply Drizzle migrations:

```bash
pnpm run db:migrate
```

3. Run monitoring tests with DB persistence:

```bash
pnpm run test:monitoring:db
```

4. Export DB runs and generate DB-based Allure report:

```bash
pnpm run allure:db
```

5. Open the DB-based Allure report:

```bash
pnpm run allure:open:db
```
