# Playwright Monitoring POC Plan

## 1) Objective and Recommendation

This POC validates whether a Docker-first Playwright monitoring stack can replace Ghost Inspector for functional monitoring checks.

Recommendation: proceed with caveats. Playwright can cover the required checks, but long-term success depends on clear ownership for test and selector maintenance.

POC target duration: 3-5 days.

## 2) Scope Boundaries (POC Only)

### In Scope

- Docker-deployable Playwright monitoring runner
- PostgreSQL metadata persistence for run history
- Allure report generation and host-served dashboard
- Scheduled execution from VPS/EC2 host context
- Failure-only Google Chat / Spaces alerts
- 2-3 initial monitoring checks (page load, element verification, CTA/form flow)
- Basic runbook-level operations guidance and ownership notes

### Out of Scope

- Full v1 rollout (8-15 checks, multi-team scale, advanced auth hardening)
- ReportPortal adoption and advanced analytics
- Multi-repo orchestration
- Complex escalation routing and ownership automation

## 3) Docker-First Architecture

The POC stack separates execution, persistence, reporting, and alerting so history and evidence are not tied to a single ephemeral runner.

- Playwright Runner: executes monitoring tests and emits artifacts/results
- Metadata Datastore (PostgreSQL): stores pass/fail run metadata for historical visibility
- Allure Dashboard: hosts HTML report output for team-accessible evidence
- Scheduler: triggers suite on cadence via host cron or scheduler container
- Alerts: sends failure-only notifications to Google Chat webhook

## 4) Deployment and Runtime Model

Runtime ownership lives on the deployed Docker host (VPS/EC2), not in GitHub Actions.

1. Build: create/update Playwright Docker image.
2. Deploy: run `docker compose up -d` on VPS/EC2 host.
3. Schedule: configure host cron or scheduler container to run suite.
4. Persist: write run metadata to PostgreSQL for every run.
5. Alert: send Google Chat alert on failure only.

GitHub Actions role (optional support only):

- Build and push Docker image
- Run PR validation checks
- Trigger remote deployment workflow

GitHub Actions is not the monitoring runtime or scheduler in this POC.

## 5) POC Deliverables and Definition of Done

### A) Docker Compose Stack

Definition of Done:

- Runner, PostgreSQL, and report-serving components start consistently.
- Services are restartable without manual repair steps.

### B) Initial Monitoring Checks (2-3)

Definition of Done:

- At least one page load health check passes.
- At least one element presence/assertion check passes.
- At least one CTA/form path check passes end-to-end.

### C) Scheduled Execution

Definition of Done:

- Scheduled job triggers suite automatically from deployed host context.
- Runs occur without GitHub Actions as runtime dependency.

### D) Metadata Persistence

Definition of Done:

- Every run writes pass/fail metadata into PostgreSQL.
- Records include all required metadata contract fields.

### E) Allure Dashboard

Definition of Done:

- Latest report is reachable from deployed host.
- Failed runs include actionable evidence for triage.

### F) Failure Alerting

Definition of Done:

- A forced test failure sends one Google Chat notification.
- Alert payload contains all required alert contract fields.

### G) Written Runbook

Definition of Done:

- Documents deploy/redeploy flow, required env vars, schedule model, ownership, and retention/cleanup guidance.

## 6) Caveats and Ownership Model

Primary caveats:

- Monitoring stability depends on ongoing selector/test maintenance.
- Credentials and auth state must be handled securely.
- Report/artifact storage requires explicit retention policy.
- Server availability becomes part of monitoring reliability.

Ownership model (POC minimum):

- Test Owner: maintains checks/selectors and triages failures.
- Platform Owner: maintains Docker host, scheduler, backups, uptime.
- Shared Responsibility: retention policy enforcement and alert noise control.

## 7) Cost and Effort (POC Path)

| Option | Estimated Monthly Cost | Fit |
| --- | --- | --- |
| Existing server + Docker Compose | $0-$5 | Best if infrastructure already exists |
| Small VPS + Docker Compose + PostgreSQL | $5-$25 | Best low-cost standalone POC path |
| EC2 small/medium + Docker Compose | $15-$40 | Best when AWS alignment or network controls are required |
| Ghost Inspector baseline | $109 | Current paid reference point |

Effort estimate:

- POC: 3-5 days

## 8) Proceed Criteria and Go/No-Go Checklist

Proceed only if the POC demonstrates all items below:

- [ ] `docker compose up` starts the full stack reliably.
- [ ] Scheduled runs execute from VPS/EC2 host model (not GitHub Actions runtime).
- [ ] Run metadata persists to PostgreSQL with required fields.
- [ ] Allure dashboard is reachable and shows latest evidence.
- [ ] Forced failure sends exactly one Google Chat alert with required triage context.
- [ ] Retention/cleanup approach is documented and manually validated.
- [ ] Ownership for test maintenance and operations is explicitly assigned.

Go decision:

- All checklist items pass and operating owners are confirmed.

No-go decision:

- Any core checklist item fails or ownership remains unclear.

---

## Implementation Sequence (Execution Order)

1. Bootstrap Docker/Compose stack.
2. Implement 2-3 monitoring checks.
3. Persist run metadata to PostgreSQL.
4. Publish and serve Allure report.
5. Wire scheduled execution on host/scheduler container.
6. Send failure-only Google Chat alerts.
7. Validate and demo against acceptance checklist.

## Public Interfaces and Contracts

### Environment Contract (Required Variables)

- Target/environment:
  - `TARGET_BASE_URL`
  - `MONITORING_ENVIRONMENT`
- Auth/credentials:
  - `AUTH_USERNAME` (if needed)
  - `AUTH_PASSWORD` (if needed)
  - `AUTH_STATE_PATH` (if reusable auth state is used)
- Database:
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- Alerting:
  - `GOOGLE_CHAT_WEBHOOK_URL`
- Scheduling/operations:
  - `SCHEDULE_CRON`
  - `RETENTION_DAYS_REPORTS`
  - `RETENTION_DAYS_ARTIFACTS`

### Metadata Contract (Minimum Run Record Fields)

Every persisted run record must include:

- `environment`
- `suite`
- `test`
- `status`
- `runtime_ms`
- `failure_point`
- `report_url`
- `timestamp`

### Alert Contract (Failure-Only Notification Payload)

Each failure notification must include:

- environment
- failed suite/test name
- runtime
- report link
- failure point

### Operational Contract

- Scheduler runs on VPS/EC2 host (or scheduler container in that host environment).
- GitHub Actions may support build/deploy workflows but does not host the monitoring runtime cadence.

## Test Plan and Acceptance Scenarios

1. Compose startup reliability:
   - Run `docker compose up -d`.
   - Verify all core services reach healthy/running state.
2. Scheduler independence:
   - Trigger scheduled execution from host scheduler.
   - Confirm run proceeds without GitHub Actions runtime involvement.
3. Persistence correctness:
   - Execute pass and fail runs.
   - Verify PostgreSQL row creation with all required metadata fields.
4. Reporting visibility:
   - Open deployed Allure dashboard endpoint.
   - Confirm latest run and artifacts are visible.
5. Alert behavior:
   - Introduce a controlled failing assertion.
   - Verify exactly one Google Chat alert with full triage fields.
6. Retention controls:
   - Document retention settings.
   - Validate manual cleanup or policy behavior to prevent unbounded growth.

## Assumptions and Defaults

- Scope is locked to POC only.
- This plan is tracked at repository root `README.md`.
- Default deployment model is Docker Compose on VPS/EC2.
- GitHub Actions is restricted to CI/deployment support (build/push/trigger), not runtime scheduling.
