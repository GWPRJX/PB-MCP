---
phase: 1
slug: database-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `vitest run --reporter=verbose tests/db/` |
| **Full suite command** | `vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `vitest run --reporter=verbose tests/db/`
- **After every plan wave:** Run `vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + `bash scripts/assert-rls.sh` exits 0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | W0 | INFRA-01 | smoke | `vitest run tests/smoke/process.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-02 | integration | `vitest run tests/db/stderr-only.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-03 | integration | `vitest run tests/db/rls-isolation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-04 | integration | `vitest run tests/db/rls-policy-coverage.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-05 | integration | `vitest run tests/db/app-role.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-06 | integration | `vitest run tests/db/stderr-only.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | W0 | INFRA-07 | ci-script | `bash scripts/assert-rls.sh` | ❌ W0 | ⬜ pending |

*Task IDs will be filled in by gsd-planner during planning. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config with test environment setup and DATABASE_URL/DATABASE_MIGRATION_URL env loading
- [ ] `tests/db/rls-isolation.test.ts` — cross-tenant isolation stubs for INFRA-03
- [ ] `tests/db/rls-policy-coverage.test.ts` — pg_class policy assertion stubs for INFRA-04
- [ ] `tests/db/app-role.test.ts` — non-superuser role verification stubs for INFRA-05
- [ ] `tests/db/stderr-only.test.ts` — child process stdout capture stubs for INFRA-02 + INFRA-06
- [ ] `tests/smoke/process.test.ts` — server process start stub for INFRA-01
- [ ] `scripts/assert-rls.sh` — CI gate script for INFRA-07 (calls scripts/check-rls.sql, exits 1 on violations)
- [ ] `scripts/check-rls.sql` — SQL query used by assert-rls.sh
- [ ] Framework install: `npm install -D vitest` — vitest not yet in package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Compose `docker compose up` starts both containers cleanly | INFRA-01 | Requires Docker runtime | Run `docker compose up`, verify postgres and app containers healthy |
| tsx watch hot-reload works after file save | INFRA-01 | Requires file-save event in running container | Edit `src/index.ts`, verify container logs show restart |
| `npm run migrate:up` applies all migrations in order | INFRA-03 | Requires running DB | Run command, check `migrate version` matches expected count |
| Connecting as app_login URL shows only tenant-scoped rows | INFRA-03 | End-to-end connectivity test | Use psql with DATABASE_URL, set session var, query products |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
