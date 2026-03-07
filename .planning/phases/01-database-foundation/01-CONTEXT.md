# Phase 1: Database Foundation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the PostgreSQL schema with Row-Level Security enforcing tenant isolation. CI verifies that cross-tenant data separation is airtight before any application layer is built on top of it. This phase delivers the database foundation only — no API, no MCP transport, no application code.

</domain>

<decisions>
## Implementation Decisions

### Migration tooling
- Plain SQL files (not TypeScript or ORM-generated) — auditable, DBA-readable, no runtime code execution
- Runner: golang-migrate, invoked via npm script wrappers (`npm run migrate:up`, `npm run migrate:down`)
- Migrations run as a separate explicit command — not auto-run on server boot
- On server startup, log a warning to stderr if pending (unapplied) migrations are detected; make this check configurable via environment variable (e.g., `MIGRATION_ALERT=true`)
- Migration files location: Claude's discretion (recommend `db/migrations/`)

### Local development setup
- Docker Compose ships with the repo — brings up both PostgreSQL and the app container
- App container uses a volume-mounted `src/` directory with `tsx watch` for hot reload (no image rebuild on code changes)
- Environment configuration: `.env` file (gitignored) + `.env.example` (committed with placeholder values)

### CI platform
- GitHub Actions — runs on every push and every pull request
- Required status check: CI must pass before any PR can be merged to main
- CI pipeline: start PostgreSQL service container → run migrations → run RLS policy assertion (INFRA-07)

### ERP table scope
- Full ERP schemas created in Phase 1 — all columns that Phase 3 tools will need, not skeleton stubs
- Tables: `tenants`, `products`, `stock_levels`, `suppliers`, `orders`, `order_line_items`, `invoices`, `contacts`, `api_keys`
- All tenant-bearing tables get `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- KB articles (`kb_articles`) is a **global cache** — no `tenant_id`, no RLS — all tenants share the same YouTrack article data

### Claude's Discretion
- Exact column definitions for each ERP table (derive from Phase 3 tool requirements)
- RLS policy expressions (current tenant ID via session variable set by application)
- Specific golang-migrate version and installation method
- Docker Compose service names and port mapping

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code to reuse

### Established Patterns
- None yet — this phase establishes the patterns for all subsequent phases

### Integration Points
- Phase 2 will connect to the database using the non-superuser role created here
- Phase 2 will set the PostgreSQL session variable (e.g., `app.current_tenant_id`) that RLS policies read
- Phase 3 builds tool handlers directly on top of the tables created here — no schema changes needed in Phase 3

</code_context>

<specifics>
## Specific Ideas

- The user reviewed the full ERP schema pattern (`CREATE TABLE products` with all columns + `ENABLE/FORCE ROW LEVEL SECURITY`) and confirmed it as the target output
- All tables should be designed with Phase 3's read-only queries in mind so no ALTER TABLE migrations are needed later

</specifics>

<deferred>
## Deferred Ideas

- Full admin alerting UI for pending migrations (email, webhook, dashboard badge) — Phase 2+ when admin API exists
- Per-tenant YouTrack KB cache — explicitly out of scope; KB is a global cache in v1

</deferred>

---

*Phase: 01-database-foundation*
*Context gathered: 2026-03-07*
