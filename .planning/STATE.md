---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: UI Polish + Setup Documentation
current_phase: 0
current_plan: 0
status: defining_requirements
stopped_at: Requirements defined, awaiting roadmap
last_updated: "2026-03-19T09:30:00Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE: PB MCP

*Project memory — updated at each session boundary*

---

## Project Reference

**Core Value:** Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

**v1 Total Phases:** 4 (all complete)
**v2 Total Phases:** 3 (all complete)

---

## Current Position

**Milestone:** v2.1 — UI Polish + Setup Documentation
**Status:** Defining requirements, creating roadmap

**Progress:**
```
v1.0 [##########] 100% COMPLETE (4/4 phases, 16/16 plans)
v2.0 [##########] 100% COMPLETE (3/3 phases, 7/7 plans) — ARCHIVED
v2.1 [░░░░░░░░░░]   0% STARTING
```

**Overall:** 7 phases, 23 plans, 65/66 requirements shipped across 2 milestones.

---

## Accumulated Context

### Architectural Decisions (still apply)

- **Stack:** TypeScript / Node.js 22 LTS, Fastify 5, PostgreSQL with RLS, Drizzle ORM, postgres.js, MCP SDK 1.27.x, zod
- **Frontend:** React + Vite + Tailwind CSS (dashboard)
- **Transport:** MCP Streamable HTTP (not stdio)
- **Tenant isolation:** PostgreSQL RLS on shared schema
- **Auth (MCP):** API-key-per-tenant, SHA-256 hashed at rest, optional expiry
- **Auth (Dashboard):** JWT HS256 via built-in Node.js crypto, 8h default expiry
- **Tenant context:** AsyncLocalStorage — never module-level variables
- **Logging:** stderr only
- **Tools call POSibolt API live** — `pbGet`/`pbPost` with OAuth token caching per tenant
- **Tool handler pattern:** getErpConfig() -> pbGet/pbPost -> toolSuccess/toolError; never throw
- **shouldRegister() filter:** All tool registration guarded by Set<string> filter
- **withAudit() wrapper:** All 27 tool handlers audit-logged (fire-and-forget)
- **DOC-* prefix:** Uploaded docs distinguished from YouTrack-synced articles

### Critical Pitfalls (must not skip)

1. **Pool contamination** — use `SET LOCAL` (transaction-scoped), not `SET` (session-scoped)
2. **RLS bypass** — app connects as non-superuser; FORCE ROW LEVEL SECURITY on tenant tables
3. **New tables missing RLS** — CI check must assert; currently 10 tenant-bearing tables
4. **Global tenant state** — AsyncLocalStorage for all tenant context
5. **Idempotency on financial writes** — write tools should handle duplicate submissions gracefully
6. **JWT secret management** — JWT signing secret must be in env var, not hardcoded

---

## Session Continuity

**Last session:** 2026-03-19
**Stopped at:** Requirements defined, creating roadmap
**Next action:** Create roadmap for v2.1

---
*State initialized: 2026-03-07*
*v1.0 completed: 2026-03-17*
*v2.0 completed: 2026-03-18*
*v2.0 archived: 2026-03-18*
*v2.1 started: 2026-03-19*
