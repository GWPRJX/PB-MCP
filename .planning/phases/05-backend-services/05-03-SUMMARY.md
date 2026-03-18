---
phase: 05-backend-services
plan: 03
subsystem: integration-tests
tags: [tests, vitest, tool-permissions, audit-log, jwt-auth, key-expiry]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [integration-test-coverage-phase5]
  affects: []
tech_stack:
  added: []
  patterns: [superuser-sql-setup-cleanup, fastify-inject-http-tests, hash-based-key-lookup]
key_files:
  created:
    - tests/admin/tool-permissions.test.ts
    - tests/admin/audit-log.test.ts
    - tests/admin/jwt-auth.test.ts
    - tests/admin/key-expiry.test.ts
  modified: []
decisions:
  - Tests use superuser SQL (DATABASE_MIGRATION_URL) for setup/cleanup to bypass RLS
  - JWT tests craft expired tokens manually via crypto.createHmac for precise expiry control
  - Key-expiry tests revoke via direct SQL rather than service function for isolation
metrics:
  duration: 3m
  completed: "2026-03-18T09:58:00Z"
  tasks: 2/2
  files_modified: 4
requirements_completed: [TAC-01, TAC-02, TAC-03, TAC-04, TAC-05, AUTH-01, AUTH-02]
---

# Phase 5 Plan 3: Integration Tests Summary

32 integration tests across 4 files covering all 7 Phase 5 requirements: tool permissions CRUD with tenant/key intersection logic, audit log recording and querying with filters/pagination, JWT sign/verify with login endpoint and protected route auth, and API key expiry with hash-based lookup.

## Task Results

### Task 1: Tool permissions and audit log integration tests
**Commit:** `6598cc7`

- **tests/admin/tool-permissions.test.ts** (9 tests, TAC-01/02/03):
  - `getToolPermissions returns all 21 tools defaulting to enabled`
  - `updateToolPermissions disables specific tools`
  - `updateToolPermissions re-enables a disabled tool`
  - `getEnabledTools returns only enabled tools`
  - `getEnabledTools with key allowedTools returns intersection`
  - `getEnabledTools with key allowedTools AND tenant disabled returns intersection`
  - `updateKeyAllowedTools sets per-key restrictions`
  - `updateKeyAllowedTools with null clears restrictions`
  - `updateKeyAllowedTools returns false for non-existent key`

- **tests/admin/audit-log.test.ts** (7 tests, TAC-04/05):
  - `recordToolCall creates an audit log entry`
  - `recordToolCall records error entries`
  - `recordToolCall does not throw on invalid tenantId (fire-and-forget safety)`
  - `queryAuditLog filters by toolName`
  - `queryAuditLog filters by status`
  - `queryAuditLog filters by both toolName and status`
  - `queryAuditLog supports pagination`

### Task 2: JWT auth and API key expiry integration tests
**Commit:** `242e2c8`

- **tests/admin/jwt-auth.test.ts** (11 tests, AUTH-01):
  - `signJwt creates a valid JWT string with 3 dot-separated base64url parts`
  - `signJwt encodes the payload with iat and exp claims`
  - `verifyJwt accepts a valid token`
  - `verifyJwt rejects a token with wrong signature`
  - `verifyJwt rejects an expired token`
  - `verifyJwt rejects malformed tokens`
  - `POST /admin/auth/login returns JWT on valid credentials`
  - `POST /admin/auth/login returns 401 on invalid credentials`
  - `Protected admin route accepts JWT Bearer token`
  - `Protected admin route accepts X-Admin-Secret header (backward compat)`
  - `Protected admin route rejects invalid JWT`
  - `Protected admin route rejects missing auth`

- **tests/admin/key-expiry.test.ts** (5 tests, AUTH-02):
  - `createApiKey without expiresAt creates a key that never expires`
  - `createApiKey with future expiresAt creates a valid key`
  - `createApiKey with past expiresAt creates an expired key`
  - `lookupApiKeyByHash returns null for non-existent hash`
  - `lookupApiKeyByHash returns null for revoked key`

## Verification Results

- TypeScript compilation (`npx tsc --noEmit --project tsconfig.test.json`): PASSED (zero errors)
- All 4 test files created with correct imports and type-safe assertions
- Test count: 32 total (9 + 7 + 11 + 5)

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Superuser SQL for test setup/cleanup** - Tests create tenants via direct `INSERT INTO tenants` using `DATABASE_MIGRATION_URL` (superuser, no RLS) and clean up via `DELETE FROM tenants` (CASCADE handles child rows). This avoids coupling tests to admin API endpoints.

2. **Manual token crafting for expiry tests** - Rather than manipulating `JWT_EXPIRY_HOURS` env var, the expired-token test manually constructs a JWT with `crypto.createHmac` using the correct secret but past `exp` claim, giving precise control over expiry.

3. **Direct SQL for key revocation in expiry tests** - Key-expiry tests revoke keys via `UPDATE api_keys SET status = 'revoked'` using superuser SQL rather than the `revokeApiKey` service function, keeping the test focused on `lookupApiKeyByHash` behavior.

## Self-Check: PASSED

- tests/admin/tool-permissions.test.ts: FOUND
- tests/admin/audit-log.test.ts: FOUND
- tests/admin/jwt-auth.test.ts: FOUND
- tests/admin/key-expiry.test.ts: FOUND
- Commit `6598cc7` (Task 1): FOUND
- Commit `242e2c8` (Task 2): FOUND
- TypeScript compiles with zero errors
