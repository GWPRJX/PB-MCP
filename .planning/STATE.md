---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: — Core MCP Server
status: unknown
stopped_at: Completed 09-02-PLAN.md
last_updated: "2026-03-19T14:52:46.743Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 27
  completed_plans: 27
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

Phase: 10 (dashboard-ux-polish) — NEXT
Plan: 1 of N

## v2.1 Phase Map

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 8. KB/Docs Management | Admin can manage server-level docs + YouTrack sync from dashboard | KB-01, KB-02, KB-03 | Complete (2026-03-19) |
| 9. Tenant Onboarding Flow | Credentials-first, ERP-verified tenant creation | ONBOARD-01, ONBOARD-02, ONBOARD-03 | Complete (2026-03-19) |
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

### Phase 9 Plan 2 Decisions

- **Wizard step state inline (not extracted):** Single component with step 1|2|3 state plus all field state — simpler than sub-components for a short wizard
- **connectionTested boolean gates Next on step 2:** Separate from testResult?.connected — ERP field onChange clears both connectionTested and testResult, forcing re-test; prevents stale-result bugs
- **Create Another resets all state:** Single handler resets step=1, all fields empty, connectionTested=false, result=null — no partial-state edge cases

### Phase 9 Plan 1 Decisions

- **testErpCredentials dynamic import:** Uses dynamic import in router consistent with existing testErpConnection pattern — avoids circular dependency risk
- **erpConfig conditional construction:** Only passed to createTenant() when at least one ERP field is present — clean API for non-ERP tenant creation flow

### Phase 8 Plan 2 Decisions

- **KnowledgeBasePage sub-components:** Internal-only section functions (YouTrackConfigSection, SyncStatusSection, UploadedDocsSection) keep file self-contained without over-engineering
- **Token update guard:** Check both changed AND not-all-asterisks before including token in PUT payload — prevents overwriting token with masked placeholder

### Phase 8 Plan 1 Decisions

- **server_settings as key-value store:** Simple TEXT PRIMARY KEY / TEXT value table — avoids schema migrations for each new setting, reads grouped by key, UPSERT pattern for updates
- **DB-first with env var fallback:** sync.ts and scheduler.ts check DB settings first, fall back to env vars — enables zero-downtime migration from env-var-only to dashboard-managed config
- **scheduler returns void:** Changed from `ReturnType<typeof setInterval>` to `void` because DB interval read is async — call site in index.ts already ignores return value
- **Token masking at GET endpoint:** Token displayed as first4****last4 — raw token never exposed via GET; write-only via PUT

### v2.1 Notes

- KB-01 changes doc upload from per-tenant to server-level — check existing upload endpoint scope
- ONBOARD flow changes tenant creation — existing `POST /admin/tenants` flow needs redesign
- UX-03 (PDF export) requires a PDF generation library — no current dependency for this
- DOCS-01–04 are pure markdown/text work, no code changes

---

## Session Continuity

**Last session:** 2026-03-19T14:48:00Z
**Stopped at:** Completed 09-02-PLAN.md
**Next action:** Execute Phase 10 (Dashboard UX Polish)

---
*State initialized: 2026-03-07*
*v1.0 completed: 2026-03-17*
*v2.0 completed: 2026-03-18*
*v2.0 archived: 2026-03-18*
*v2.1 started: 2026-03-19*
*v2.1 roadmap created: 2026-03-19*
