# Playwright + Docker + Allure Run Guide

This project uses Playwright tests, PostgreSQL in Docker, and Allure reports exported from DB-backed runs.

## Run Flow

1. Start PostgreSQL container:

```bash
pnpm run db:up
```

2. Initialize schema (only if not initialized yet):

```bash
pnpm run db:init
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
