---
phase: 01-database-foundation
plan: 04
subsystem: ci
tags: [github-actions, ci, postgresql, golang-migrate, rls, infra-07]

# Dependency graph
requires:
  - phase: 01-01
    provides: Project scaffold, vitest config, docker-compose, golang-migrate setup
  - phase: 01-02
    provides: Roles (app_user/app_login), tenants/api_keys migrations, postgres.js client
  - phase: 01-03
    provides: ERP migrations (7 tenant-bearing tables with FORCE RLS), kb_articles, integration tests, check-pending.ts

provides:
  - .github/workflows/ci.yml — GitHub Actions CI pipeline with postgres service, migrations, RLS gate, vitest
  - CI enforcement of INFRA-07: build fails if any tenant-bearing table missing ENABLE+FORCE RLS or policy
  - Pinned golang-migrate v4.19.1 in CI (not @latest)
  - Dual DATABASE_URL (app_login, RLS enforced) / DATABASE_MIGRATION_URL (postgres, DDL) in test step

affects:
  - All future PRs — CI is a required status check before merge
  - Phase 2 (developer workflow validated end-to-end before Tenant Management begins)

# Tech tracking
tech-stack:
  added:
    - GitHub Actions (CI platform, triggered on push + pull_request)
  patterns:
    - "CI postgres service: postgres:17-alpine with pg_isready health check, mapped to localhost:5432"
    - "golang-migrate install: curl GitHub releases tarball, pin to v4.19.1, sudo mv to /usr/local/bin"
    - "Role bootstrap after migrations: CREATE ROLE IF NOT EXISTS defensively, then GRANT app_user TO app_login"
    - "assert-rls.sh uses DATABASE_URL (postgres superuser) in CI to query pg_class — not the app_login URL"
    - "Test step sets both DATABASE_URL (app_login) and DATABASE_MIGRATION_URL (postgres) for dual-connection tests"

key-files:
  created:
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "assert-rls.sh step uses postgres superuser URL (DATABASE_MIGRATION_URL) so it can query pg_class without RLS filtering — but env override provides a superuser URL to the step"
  - "Role creation step runs defensively after migrations — migration 000001 creates app_user NOLOGIN, CI step also creates app_login with ci_password and GRANT for test run"
  - "npm test final step uses app_login URL (RLS enforced) for DATABASE_URL and postgres URL for DATABASE_MIGRATION_URL — matches dual-connection test design from Plan 03"

patterns-established:
  - "CI pipeline order: checkout → setup-node → npm ci → install migrate → run migrations → create app roles → assert-rls.sh → npm test"
  - "golang-migrate always pinned to exact version in CI (v4.19.1) — never @latest"

requirements-completed: [INFRA-01, INFRA-07]

# Metrics
duration: ~2min (Task 1 only — checkpoint pending human verification)
completed: 2026-03-16
---

# Phase 1 Plan 04: GitHub Actions CI Workflow Summary

**GitHub Actions CI pipeline with postgres:17-alpine service, golang-migrate v4.19.1, assert-rls.sh INFRA-07 gate, and vitest — checkpoint awaiting human end-to-end verification**

## Performance

- **Duration:** ~2 min (Task 1 complete; checkpoint pending)
- **Started:** 2026-03-16T08:34:42Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify — blocking)
- **Files created:** 1 (.github/workflows/ci.yml)

## Accomplishments

- Created .github/workflows/ci.yml following RESEARCH.md Pattern 8 exactly, with task-action additions
- CI triggers on `push` and `pull_request` events
- postgres:17-alpine service container with pg_isready health check (10s interval, 5s timeout, 5 retries)
- golang-migrate v4.19.1 pinned install via curl from GitHub releases
- Migrations run via DATABASE_MIGRATION_URL (postgres superuser) — not app_login
- Defensive role creation after migrations (app_user NOLOGIN + app_login LOGIN with ci_password)
- assert-rls.sh step uses postgres superuser URL — exits 1 if any tenant-bearing table missing RLS
- npm test final step with both DATABASE_URL (app_login) and DATABASE_MIGRATION_URL (postgres) set

## CI Pipeline Steps (in order)

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node-version: '22', cache: 'npm')
3. `npm ci`
4. Install golang-migrate v4.19.1 (curl from GitHub releases → /usr/local/bin/migrate)
5. Run migrations (`migrate -path db/migrations -database "$DATABASE_MIGRATION_URL" up`)
6. Create app roles defensively (app_user NOLOGIN + app_login LOGIN + GRANTs)
7. Assert RLS coverage (`bash scripts/assert-rls.sh`) — INFRA-07 gate, exits 1 on violations
8. Run test suite (`npm test`) with dual DATABASE_URL / DATABASE_MIGRATION_URL

## golang-migrate Version

Pinned to **v4.19.1** (not @latest). Install verified via `grep -q "v4.19.1" .github/workflows/ci.yml`.

## Task Commits

1. **Task 1: GitHub Actions CI workflow** — `2d16190` (feat)

## Files Created/Modified

- `.github/workflows/ci.yml` — CI pipeline: postgres:17-alpine service, golang-migrate v4.19.1 install, migrations, app role creation, assert-rls.sh INFRA-07 gate, npm test

## Checkpoint Status

**AWAITING HUMAN VERIFICATION** — Task 2 is a `checkpoint:human-verify` gate.

The human must run the 6-step local verification:
1. `docker compose up -d postgres` — postgres service healthy
2. `npm run migrate:up` + `npm run migrate:status` — 5 migrations applied at version 5
3. `bash scripts/assert-rls.sh` — exits 0 (all 8 tenant-bearing tables have ENABLE+FORCE RLS + policy)
4. `npm run test:db` — all tests pass, 0 failures
5. RLS spot-check as app_login with and without tenant context
6. `node src/index.ts` stdout/stderr verification

## Deviations from Plan

None — plan executed exactly as written. The CI workflow follows Pattern 8 from RESEARCH.md with the additional task-action details (dual env vars, GRANT USAGE/SELECT on sequences, assert-rls.sh as a named step rather than inline psql).

## Issues Encountered

No issues. File created and verified in a single pass.

## Next Phase Readiness

- When the checkpoint is approved, Phase 1 is 100% complete (all 7 INFRA requirements satisfied)
- Phase 2 (Tenant Management + MCP Shell) can begin
- CI is now the enforcement gate for all future RLS requirements

---
*Phase: 01-database-foundation*
*Completed: 2026-03-16 (checkpoint pending)*
