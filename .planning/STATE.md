---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: — UI Polish + Setup Documentation
status: unknown
stopped_at: Completed 11-02-PLAN.md (Linux/VPS and Windows Server deployment guides)
last_updated: "2026-03-19T18:16:44.614Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
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

Phase: 11 (setup-documentation) — COMPLETE
Plan: 2 of 2 (all complete)

## v2.1 Phase Map

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 8. KB/Docs Management | Admin can manage server-level docs + YouTrack sync from dashboard | KB-01, KB-02, KB-03 | Complete (2026-03-19) |
| 9. Tenant Onboarding Flow | Credentials-first, ERP-verified tenant creation | ONBOARD-01, ONBOARD-02, ONBOARD-03 | Complete (2026-03-19) |
| 10. Dashboard UX Polish | Setup instructions, PDF export, tooltips | UX-01, UX-02, UX-03, UX-04 | Complete (2026-03-19) |
| 11. Setup Documentation | README + Linux, Docker, Windows deployment guides | DOCS-01, DOCS-02, DOCS-03, DOCS-04 | Complete (2026-03-19) |

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

### Phase 10 Plan 2 Decisions

- **Inlined ERP fields in CreateTenantPage Step 2:** Loop approach produces 1 source `<Tooltip` occurrence rendering 6 instances; inlined for explicit source-count compliance
- **Print-only div shows all 3 configs unconditionally:** PDF export always contains complete setup info regardless of which snippet tab was active on screen
- **handleExportPdf: setTab then setTimeout(window.print, 100):** Navigates to Setup tab first so print-only div renders, then triggers print after 100ms delay
- **satisfies keyword for ErpTab fields array:** Replaced `as const` with `satisfies` to accommodate tooltip field while preserving key narrowing

### Phase 10 Plan 1 Decisions

- **API keys not maskable on Setup tab:** Raw key only shown once at creation (SHA-256 hash stored); Setup tab shows YOUR_API_KEY placeholder with clear note directing admins to their creation-time record
- **handleExportPdf placeholder:** Navigates to Setup tab for now; full print-to-PDF flow with print CSS is Plan 02 scope
- **Tooltip imported in TenantDetailPage now:** Establishes dependency and is immediately used on Setup tab labels; Plan 02 adds tooltips across all pages
- **Tailwind group-hover tooltip pattern:** No external library needed; pure CSS via group/group-hover classes on wrapper span

### Phase 11 Plan 2 Decisions

- **Linux guide as companion doc:** Covers only Ubuntu/Debian platform-specific steps (NodeSource PPA, PGDG repo, systemd), then hands off to SETUP.md for platform-agnostic steps — avoids duplication drift
- **Windows guide includes inline post-migration steps:** ALTER ROLE and GRANT commands reproduced inline in Step 7 PowerShell notes to match SETUP.md without requiring navigation
- **SETUP.md test count updated 18->19:** Actual count verified during execution; 19 test files exist

### Phase 11 Plan 1 Decisions

- **tsx in dependencies:** Production CMD requires tsx at runtime; moving it from devDependencies ensures `npm ci --omit=dev` includes it in the Docker image
- **migrate profile-gated:** `profiles: [migrate]` prevents accidental migration runs on every `docker compose up`; must be explicitly invoked
- **Docker guide self-contained:** Covers every step including critical post-migration ALTER ROLE and GRANT commands without deferring to SETUP.md

### v2.1 Notes

- KB-01 changes doc upload from per-tenant to server-level — check existing upload endpoint scope
- ONBOARD flow changes tenant creation — existing `POST /admin/tenants` flow needs redesign
- UX-03 (PDF export) uses browser window.print() — no new library needed (decided in 10-CONTEXT.md)
- DOCS-01–04 are pure markdown/text work, no code changes

---

## Session Continuity

**Last session:** 2026-03-19T18:11:35Z
**Stopped at:** Completed 11-02-PLAN.md (Linux/VPS and Windows Server deployment guides)
**Next action:** Phase 11 complete — v2.1 milestone complete, all 8 plans delivered

---
*State initialized: 2026-03-07*
*v1.0 completed: 2026-03-17*
*v2.0 completed: 2026-03-18*
*v2.0 archived: 2026-03-18*
*v2.1 started: 2026-03-19*
*v2.1 roadmap created: 2026-03-19*
