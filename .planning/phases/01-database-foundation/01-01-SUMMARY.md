---
phase: 01-database-foundation
plan: 01
subsystem: infra
tags: [typescript, nodejs, vitest, docker, postgres, golang-migrate, rls]

# Dependency graph
requires: []
provides:
  - "npm project scaffold with TypeScript, vitest, postgres.js, dotenv"
  - "Docker Compose dev environment (postgres:17-alpine + app container)"
  - "All 5 test stub files covering INFRA-01 through INFRA-07"
  - "CI RLS assertion script (scripts/assert-rls.sh) with fail-fast behavior"
  - "src/index.ts placeholder establishing stderr-only logging discipline"
affects:
  - "01-02 (migrations plan needs package.json scripts)"
  - "01-03 (RLS tests plan fills in test stubs created here)"
  - "01-04 (GitHub Actions CI plan references assert-rls.sh created here)"
  - "All subsequent plans depend on runnable vitest framework"

# Tech tracking
tech-stack:
  added:
    - "vitest (latest) — test runner"
    - "typescript ^5.0.0 — language compiler"
    - "tsx (latest) — TypeScript runner + hot reload"
    - "@types/node ^22.0.0 — Node.js type definitions"
    - "postgres ^3.4.0 — PostgreSQL client"
    - "dotenv ^16.0.0 — environment variable loading"
  patterns:
    - "stderr-only logging: process.stderr.write() never console.log() (INFRA-06)"
    - "Dual database URLs: DATABASE_URL (app_login, non-superuser) vs DATABASE_MIGRATION_URL (postgres, DDL)"
    - "golang-migrate binary via npm script wrappers (not an npm package)"
    - "CHOKIDAR_USEPOLLING=true for tsx watch on Windows/WSL2 Docker"
    - "it.todo() stubs for tests requiring DB/migrations not yet available"

key-files:
  created:
    - "package.json — npm scripts: migrate:up/down/status/create, test, test:db, dev"
    - "tsconfig.json — NodeNext module resolution, strict mode, ES2022 target"
    - "vitest.config.ts — 30s timeout, DATABASE_URL/DATABASE_MIGRATION_URL env defaults"
    - ".env.example — placeholder credentials only, no real secrets"
    - ".gitignore — node_modules/, dist/, .env, *.js.map"
    - "Dockerfile.dev — node:22-alpine, npm ci, volume-mounted src/"
    - "docker-compose.yml — postgres:17-alpine with healthcheck + app with hot reload"
    - "src/index.ts — placeholder using process.stderr.write() only"
    - "tests/db/rls-isolation.test.ts — INFRA-03 stubs (7 todos)"
    - "tests/db/rls-policy-coverage.test.ts — INFRA-04 stubs (4 todos)"
    - "tests/db/app-role.test.ts — INFRA-05 stubs (4 todos)"
    - "tests/db/stderr-only.test.ts — INFRA-02+INFRA-06 stubs (3 todos)"
    - "tests/smoke/process.test.ts — INFRA-01 stubs (2 todos)"
    - "scripts/check-rls.sql — pg_class + pg_policies violation query"
    - "scripts/assert-rls.sh — CI gate, exits 1 when RLS violations or DATABASE_URL unset"
    - "package-lock.json — produced by npm install"
  modified: []

key-decisions:
  - "golang-migrate is a static binary, not an npm package — npm scripts are wrappers only"
  - "src/index.ts uses process.stderr.write() from the very first file to establish INFRA-06 discipline"
  - "Test stubs use it.todo() (not empty it() bodies) so vitest exits 0 without a running database"
  - "DATABASE_URL for app role (non-superuser, RLS enforced), DATABASE_MIGRATION_URL for postgres superuser (DDL)"

patterns-established:
  - "Pattern: All application output via process.stderr.write() — never console.log()"
  - "Pattern: Test stubs with it.todo() allow vitest run to exit 0 before infrastructure exists"
  - "Pattern: assert-rls.sh fail-fast on unset DATABASE_URL prevents silent CI pass"

requirements-completed:
  - INFRA-01
  - INFRA-07

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 1 Plan 01: Project Skeleton Summary

**TypeScript/Node.js 22 project scaffold with Docker Compose dev environment, vitest test stubs for all 7 INFRA requirements, and CI RLS assertion script — every subsequent plan has runnable verify commands from its first commit.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T08:06:14Z
- **Completed:** 2026-03-16T08:14:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- npm project scaffold fully functional: `npm install` succeeds, `vitest run` exits 0 (20 todos, 0 failures)
- Docker Compose dev environment configured: postgres:17-alpine with healthcheck + app container with CHOKIDAR_USEPOLLING=true for Windows/WSL2 hot reload
- All 5 test stub files created covering every INFRA requirement (INFRA-01 through INFRA-07), enabling subsequent plans to reference test files that exist
- CI assertion script `scripts/assert-rls.sh` confirmed fail-fast: exits 1 with clear error when DATABASE_URL is not set
- stderr-only logging discipline established from the very first application file (`src/index.ts`)

## Task Commits

1. **Task 1: Project scaffold — package.json, tsconfig, Docker Compose, .env files** - `0b29dff` (chore)
2. **Task 2: Test stubs — all 5 test files + CI assertion scripts** - `362bd03` (chore)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `package.json` — scripts: migrate:up/down/status/create, test, test:db, dev; deps: postgres, dotenv; devDeps: typescript, @types/node, tsx, vitest
- `package-lock.json` — lockfile from npm install (55 packages)
- `tsconfig.json` — NodeNext module resolution, strict mode, ES2022 target, rootDir: src/
- `vitest.config.ts` — globals: true, node environment, 30s timeout, DATABASE_URL + DATABASE_MIGRATION_URL env defaults
- `.env.example` — placeholder credentials with comments explaining dual-URL pattern
- `.gitignore` — node_modules/, dist/, .env, *.js.map
- `Dockerfile.dev` — node:22-alpine base, npm ci, EXPOSE 3000
- `docker-compose.yml` — postgres:17-alpine + app with CHOKIDAR_USEPOLLING=true, service_healthy depends_on
- `src/index.ts` — placeholder; stderr-only output
- `tests/db/rls-isolation.test.ts` — 7 it.todo stubs for INFRA-03
- `tests/db/rls-policy-coverage.test.ts` — 4 it.todo stubs for INFRA-04
- `tests/db/app-role.test.ts` — 4 it.todo stubs for INFRA-05
- `tests/db/stderr-only.test.ts` — 3 it.todo stubs for INFRA-02+INFRA-06
- `tests/smoke/process.test.ts` — 2 it.todo stubs for INFRA-01
- `scripts/check-rls.sql` — pg_class + pg_policies query returning violations
- `scripts/assert-rls.sh` — executable CI gate; exits 1 on violation or missing DATABASE_URL

## Deviations from Plan

None — plan executed exactly as written.

Docker CLI not available in execution environment; `docker compose config` validation was skipped. The `docker-compose.yml` file is syntactically valid YAML per the pattern from RESEARCH.md Pattern 7.

## Self-Check: PASSED

All 15 files confirmed present on disk. Both task commits (0b29dff, 362bd03) confirmed in git log.
