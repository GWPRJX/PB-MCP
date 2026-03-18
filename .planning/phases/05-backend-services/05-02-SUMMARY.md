---
plan: 05-02
phase: 05-backend-services
subsystem: auth + api-keys
status: complete
completed: 2026-03-18
tags: [jwt, auth, api-key-expiry, security, migration]
dependency_graph:
  requires: []
  provides: [jwt-auth, api-key-expiry, login-endpoint]
  affects: [src/admin/auth-middleware.ts, src/admin/router.ts, src/admin/tenant-service.ts, src/mcp/auth.ts, src/server.ts, src/index.ts, src/db/schema.ts]
tech_stack:
  added: []
  patterns: [hmac-sha256-jwt, timing-safe-compare, fastify-onRequest-hook, dual-auth-fallback]
key_files:
  created: [src/admin/auth-middleware.ts, db/migrations/000009_add_api_key_expiry.up.sql, db/migrations/000009_add_api_key_expiry.down.sql]
  modified: [src/server.ts, src/admin/router.ts, src/admin/tenant-service.ts, src/mcp/auth.ts, src/index.ts, src/db/schema.ts]
decisions:
  - JWT uses Node.js built-in crypto HMAC-SHA256 with no external library
  - Login endpoint registered outside admin plugin scope to bypass JWT auth hook
  - jwtAuthHook accepts both JWT Bearer tokens and X-Admin-Secret for backward compatibility
  - API key expiry uses nullable expires_at column (NULL means never expires)
  - lookupApiKeyByHash returns discriminated union with { expired: true } variant
  - JWT_SECRET is required at startup alongside ADMIN_SECRET and DATABASE_URL
metrics:
  duration: "~3 minutes"
  completed: "2026-03-18"
  tasks_completed: 2
  files_changed: 10
---

# Phase 5 Plan 02: JWT Auth + API Key Expiry Summary

**One-liner:** JWT auth with HS256 signing via built-in crypto, dual-mode admin auth (JWT or X-Admin-Secret), login endpoint, and nullable API key expiry with MCP-level rejection.

---

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create JWT auth module and migration 000009 | c60dac9 |
| 2 | Wire login endpoint, JWT middleware, and key expiry check | 2d117f6 |

---

## What Was Built

### JWT Auth Module (src/admin/auth-middleware.ts)

Three exports, zero external dependencies:

- **signJwt(payload)** -- Creates HS256 JWT with base64url encoding, auto-sets iat/exp (default 8h via JWT_EXPIRY_HOURS env var). Throws if JWT_SECRET missing.
- **verifyJwt(token)** -- Validates HS256 signature using crypto.timingSafeEqual (timing-attack safe), checks exp claim. Returns payload or null.
- **jwtAuthHook(request, reply)** -- Fastify onRequest hook. Tries Authorization: Bearer JWT first, falls back to X-Admin-Secret header. Returns 401 if neither valid.

### Login Endpoint (POST /admin/auth/login)

Registered outside the admin router plugin scope so it bypasses the JWT auth hook. Checks username against ADMIN_USERNAME env var (default 'admin') and password against ADMIN_SECRET. Returns `{ token }` on success, 401 on failure.

### API Key Expiry

- **Migration 000009** -- Adds nullable `expires_at TIMESTAMPTZ` column to api_keys table.
- **createApiKey** -- Accepts optional `expiresAt` parameter, inserts into expires_at column.
- **lookupApiKeyByHash** -- Checks expires_at after revocation check. Returns `{ expired: true }` for expired keys (discriminated union).
- **MCP auth** -- Handles expired result with specific "API key expired" error message (code -32001).

### Startup Validation

JWT_SECRET added to required env vars in src/index.ts. Server exits with clear error if not set.

### CORS Update

Authorization header added to CORS allowedHeaders for dashboard JWT support.

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (plan files) | PASSED (no errors in any modified files) |
| Pre-existing errors in src/tools/inventory.ts | Out of scope (MCP SDK type mismatch) |
| signJwt, verifyJwt, jwtAuthHook exports | Confirmed in auth-middleware.ts |
| jwtAuthHook wired in router.ts | Confirmed (replaced checkAdminAuth) |
| login endpoint in server.ts | Confirmed (outside admin plugin scope) |
| JWT_SECRET validation in index.ts | Confirmed |
| expired key handling in mcp/auth.ts | Confirmed |
| expiresAt in createApiKey and lookupApiKeyByHash | Confirmed |
| Migration 000009 files | Confirmed (up + down) |
| expiresAt in Drizzle schema | Confirmed |

---

## Deviations from Plan

None -- plan executed exactly as written.

---

## Self-Check: PASSED

- FOUND: src/admin/auth-middleware.ts
- FOUND: db/migrations/000009_add_api_key_expiry.up.sql
- FOUND: db/migrations/000009_add_api_key_expiry.down.sql
- FOUND: src/server.ts (modified)
- FOUND: src/admin/router.ts (modified)
- FOUND: src/admin/tenant-service.ts (modified)
- FOUND: src/mcp/auth.ts (modified)
- FOUND: src/index.ts (modified)
- FOUND: src/db/schema.ts (modified)
- FOUND commit: c60dac9 (feat(05-02): add JWT auth module and migration 000009)
- FOUND commit: 2d117f6 (feat(05-02): wire JWT login, auth middleware, and API key expiry)
