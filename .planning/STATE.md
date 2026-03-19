---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: UI Polish + Setup Documentation
current_phase: 8
current_plan: 0
status: roadmap_complete
stopped_at: Roadmap created, ready to plan Phase 8
last_updated: "2026-03-19T10:00:00Z"
progress:
  total_phases: 4
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
**v2.1 Total Phases:** 4 (phases 8–11)

---

## Current Position

**Milestone:** v2.1 — UI Polish + Setup Documentation
**Current Phase:** Phase 8 — KB/Docs Management
**Status:** Roadmap complete, ready to plan Phase 8

**Progress:**
```
v1.0 [##########] 100% COMPLETE (4/4 phases, 16/16 plans)
v2.0 [##########] 100% COMPLETE (3/3 phases, 7/7 plans) — ARCHIVED
v2.1 [░░░░░░░░░░]   0% IN PROGRESS (0/4 phases, 0/? plans)
```

**Overall:** 7 phases, 23 plans, 65/66 requirements shipped across 2 milestones.

---

## v2.1 Phase Map

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 8. KB/Docs Management | Admin can manage server-level docs + YouTrack sync from dashboard | KB-01, KB-02, KB-03 | Not started |
| 9. Tenant Onboarding Flow | Credentials-first, ERP-verified tenant creation | ONBOARD-01, ONBOARD-02, ONBOARD-03 | Not started |
| 10. Dashboard UX Polish | Setup instructions, PDF export, tooltips | UX-01, UX-02, UX-03, UX-04 | Not started |
| 11. Setup Documentation | README + Linux, Docker, Windows deployment guides | DOCS-01, DOCS-02, DOCS-03, DOCS-04 | Not started |

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

### v2.1 Notes

- KB-01 changes doc upload from per-tenant to server-level — check existing upload endpoint scope
- ONBOARD flow changes tenant creation — existing `POST /admin/tenants` flow needs redesign
- UX-03 (PDF export) requires a PDF generation library — no current dependency for this
- DOCS-01–04 are pure markdown/text work, no code changes

---

## Session Continuity

**Last session:** 2026-03-19
**Stopped at:** Roadmap created for v2.1 (phases 8–11, 14/14 requirements mapped)
**Next action:** Plan Phase 8 via `/gsd:plan-phase 8`

---
*State initialized: 2026-03-07*
*v1.0 completed: 2026-03-17*
*v2.0 completed: 2026-03-18*
*v2.0 archived: 2026-03-18*
*v2.1 started: 2026-03-19*
*v2.1 roadmap created: 2026-03-19*
