---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Admin Dashboard + Write Operations
current_phase: 6
current_plan: 3
status: in-progress
stopped_at: Completed 06-02-PLAN.md — Phase 6 complete, next is Phase 7
last_updated: "2026-03-18T10:29:24Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# STATE: PB MCP

*Project memory — updated at each session boundary*

---

## Project Reference

**Core Value:** Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

**v1 Total Phases:** 4 (all complete)
**v2 Total Phases:** 3
**v2 Total Requirements:** 26

---

## Current Position

**Milestone:** v2.0 — Admin Dashboard + Write Operations
**Current Phase:** 7 (Write Tools) -- next to plan
**Current Plan:** N/A (Phase 7 not yet planned)
**Status:** Phase 6 complete, Phase 7 pending planning

**Progress:**
```
v1.0 [██████████] 100% COMPLETE (4/4 phases, 16/16 plans)
v2.0 [████████░░]  80%
Phase 5 [██████████] 100% Backend Services (3/3 plans complete)
Phase 6 [██████████] 100% Admin Dashboard + Doc Upload (2/2 plans complete)
Phase 7 [░░░░░░░░░░]   0% Write Tools (not yet planned)
```

**Overall:** 2/3 v2 phases complete (5/5 plans executed)

---

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Backend Services | TAC-01 to TAC-05, AUTH-01, AUTH-02 (7) | Complete (3/3 plans) |
| 6 | Admin Dashboard + Doc Upload | DASH-01 to DASH-09, UPLOAD-01 to UPLOAD-04 (13) | Complete (2/2 plans) |
| 7 | Write Tools | WRITE-01 to WRITE-06 (6) | Not started |

---

## Existing v2 Code (Working Tree)

**Important:** Significant v2 backend + dashboard code already exists uncommitted from a prior session. Phase planning must account for this existing work.

### Already coded (needs completion + tests):
- **Migrations 000007 + 000008** — tool_permissions and audit_log tables (written, not applied)
- **tool-permissions-service.ts** — getToolPermissions, getEnabledTools, updateToolPermissions, updateKeyAllowedTools
- **audit-service.ts** — recordToolCall (fire-and-forget), queryAuditLog (parameterized)
- **connection-tester.ts** — testErpConnection
- **tenant-service.ts** — updateTenantErpConfig, lookupApiKeyByHash returns allowedTools
- **context.ts** — TenantContext includes enabledTools, getEnabledToolNames()
- **auth.ts** — loads tool permissions + key allowed_tools in parallel
- **server.ts (MCP)** — createMcpServer(enabledTools?) filters tools via Set
- **All tool files** — accept filter parameter, shouldRegister() guard
- **Admin router** — 7 new endpoints (tools CRUD, key scoping, ERP config, connection test, audit log, tools list)
- **Dashboard** — Vite + React + Tailwind; login, tenant list, create, detail with tabs; full API client

### Not yet coded:
- ~~Audit logging wiring~~ DONE (05-01)
- ~~JWT auth for dashboard~~ DONE (05-02)
- ~~API key expiry~~ DONE (05-02)
- ~~Doc upload (backend + frontend)~~ DONE (06-02)
- Write tools
- ~~Tests for all v2 features~~ DONE (05-03)
- ~~CI updates~~ DONE (05-01)
- ~~Build scripts + .gitignore for dashboard~~ DONE (06-01)

---

## Performance Metrics

### v1

**Plans executed:** 16
**Plans passed verification:** 16
**Requirements completed:** 39/40

### v2

**Plans executed:** 5
**Plans passed verification:** 5
**Requirements completed:** 15/26

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 05-01 | 5m | 2 | 8 |
| 05-02 | ~3m | 2 | 10 |
| 05-03 | 3m | 2 | 4 |
| 06-01 | ~4m | 3 | 8 |
| 06-02 | ~3m | 2 | 3 |

---

## Accumulated Context

### v1 Architectural Decisions (still apply)

- **Stack:** TypeScript / Node.js 22 LTS, Fastify 5, PostgreSQL with RLS, Drizzle ORM, postgres.js, MCP SDK 1.27.x, zod
- **Transport:** MCP Streamable HTTP (not stdio)
- **Tenant isolation:** PostgreSQL RLS on shared schema
- **Auth (v1):** API-key-per-tenant, SHA-256 hashed at rest
- **Tenant context:** AsyncLocalStorage — never module-level variables
- **Logging:** stderr only
- **Tools call POSibolt API live** — `pbGet`/`pbPost` with OAuth token caching per tenant
- **Tool handler pattern:** getErpConfig() → pbGet/pbPost → toolSuccess/toolError; never throw
- **shouldRegister() filter:** All tool registration guarded by Set<string> filter

### v2 Architectural Decisions

- **JWT for dashboard:** Replace raw admin secret in localStorage with signed JWT
- **API key expiry:** `expires_at` column on api_keys; checked at auth time
- **Doc upload:** Markdown files stored in kb_articles table; reuses existing KB search tools
- **Write tools:** Follow same pattern as read tools (getErpConfig → pbPost → toolSuccess); audit-logged
- **Dashboard serving:** @fastify/static for production; Vite proxy for dev
- **Dashboard auth:** JWT Bearer token in localStorage (jwt_token key); login via POST /admin/auth/login
- **Per-key scoping UI:** Expandable table row with checkbox list (not modal)

### Critical Pitfalls (must not skip)

1. **Pool contamination** — use `SET LOCAL` (transaction-scoped), not `SET` (session-scoped)
2. **RLS bypass** — app connects as non-superuser; FORCE ROW LEVEL SECURITY on tenant tables
3. **New tables missing RLS** — CI check must assert; tool_permissions and audit_log need RLS
4. **Global tenant state** — AsyncLocalStorage for all tenant context; concurrent request race condition is silent
5. **Idempotency on financial writes** — write tools should handle duplicate submissions gracefully
6. **JWT secret management** — JWT signing secret must be in env var, not hardcoded

### Open Questions

| # | Question | Decide Before |
|---|----------|---------------|
| 1 | POSibolt write API endpoints: exact paths for stock adjustment, invoice creation, contact creation | Phase 7 planning (research needed) |
| 2 | ~~JWT expiry duration: 1h, 8h, 24h?~~ RESOLVED: 8h default via JWT_EXPIRY_HOURS | 05-02 |
| 3 | ~~Doc upload size limit~~ RESOLVED: 1MB (1,048,576 chars) | 06-02 |

---

## Todos

- [x] Plan Phase 5 (Backend Services)
- [ ] Apply migrations 000007 + 000008
- [x] Wire audit logging into tool handlers
- [ ] Research POSibolt write API endpoints for Phase 7

---

## Blockers

None.

---

## Session Continuity

**Last session:** 2026-03-18
**Stopped at:** Completed 06-02-PLAN.md (KB doc CRUD + API Docs tab) -- Phase 6 complete
**Next action:** Plan Phase 7 (Write Tools)

---
*State initialized: 2026-03-07*
*v1.0 completed: 2026-03-17*
*v2.0 started: 2026-03-18 — milestone scoped, ready for phase planning*
