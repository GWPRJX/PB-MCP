# Roadmap: PB MCP

**Project:** Multi-Tenant ERP MCP Server
**Granularity:** Coarse
**Created:** 2026-03-07

---

<details>
<summary>v1.0 — Core MCP Server (COMPLETE)</summary>

**Completed:** 2026-03-17 | 4 phases, 16 plans, 39/40 requirements
</details>

<details>
<summary>v2.0 — Admin Dashboard + Write Operations (COMPLETE)</summary>

**Completed:** 2026-03-18 | 3 phases, 7 plans, 26/26 requirements | [Archive](milestones/v2.0-ROADMAP.md)
</details>

---

## v2.1 — UI Polish + Setup Documentation (IN PROGRESS)

**Goal:** Make the server easy to set up and use for anyone — polish dashboard UX, fix KB docs management, improve tenant onboarding flow, and provide comprehensive setup documentation.
**Requirements:** 16 v2.1 requirements
**Phases:** 4 (numbered 8–11)

### Phases

- [x] **Phase 8: KB/Docs Management** - YouTrack config from dashboard, manual sync, server-level doc upload
- [x] **Phase 9: Tenant Onboarding Flow** - Credentials-first, connection-tested tenant creation flow (completed 2026-03-19)
- [x] **Phase 10: Dashboard UX Polish** - MCP client setup instructions, PDF export, and tooltips for all technical terms (completed 2026-03-19)
- [ ] **Phase 11: Setup Documentation** - README overhaul and step-by-step deployment guides for Linux, Docker, and Windows

### Phase Details

#### Phase 8: KB/Docs Management
**Goal**: Admin can configure YouTrack connection, trigger syncs, and manually upload docs — all from the dashboard
**Depends on**: Nothing (first phase of v2.1)
**Requirements**: KB-01, KB-02, KB-03, KB-04, KB-05
**Success Criteria** (what must be TRUE):
  1. Admin can configure YouTrack connection settings (API key, base URL, project) from the dashboard instead of env vars
  2. Admin can click a sync button that triggers an immediate YouTrack sync
  3. Dashboard displays last sync timestamp, article count, and success/failure status
  4. Admin can manually upload API docs at server level to fill gaps not covered by YouTrack
  5. Uploaded docs are searchable via MCP KB tools alongside YouTrack-synced articles
**Plans:** 2/2 plans complete

Plans:
- [x] 08-01-PLAN.md — Backend: server_settings table, settings service, admin endpoints, sync/scheduler DB integration
- [x] 08-02-PLAN.md — Frontend: KnowledgeBasePage with YT config, sync status, doc management; remove DocsTab from tenant page

#### Phase 9: Tenant Onboarding Flow
**Goal**: New tenants are created only after ERP credentials are verified, preventing broken tenant records from day one
**Depends on**: Phase 8
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03
**Success Criteria** (what must be TRUE):
  1. The tenant creation form prompts for ERP credentials (host, username, password, company) before any other step
  2. After entering ERP credentials, admin sees a "Test Connection" step and receives a clear pass or fail result before continuing
  3. The API key generation step only becomes available after a successful ERP connection test — the flow cannot skip this gate
**Plans:** 2/2 plans complete

Plans:
- [x] 09-01-PLAN.md — Backend: test-erp-credentials endpoint (no tenant required) + tenant creation accepts ERP config
- [x] 09-02-PLAN.md — Frontend: 3-step wizard (Tenant Info -> ERP Credentials with connection test -> API Key)

#### Phase 10: Dashboard UX Polish
**Goal**: Any developer who opens the dashboard can immediately understand how to connect an MCP client and manage a tenant
**Depends on**: Phase 9
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Tenant detail page shows ready-to-use MCP client setup instructions (server URL and API key) with copy buttons
  2. Setup instructions include configuration snippets for Claude Desktop, Cursor, and a generic JSON MCP client
  3. Admin can click "Export PDF" on a tenant and download a branded PDF containing tenant name, MCP URL, masked API key, and usage instructions
  4. Every technical term in the dashboard (API key, slug, tool permissions, ERP config, etc.) has a tooltip that explains it in plain language on hover
**Plans:** 2/2 plans complete

Plans:
- [ ] 10-01-PLAN.md — Tooltip component + Setup tab with MCP client config snippets and copy buttons
- [ ] 10-02-PLAN.md — Tooltips across all dashboard pages + browser print-to-PDF export

#### Phase 11: Setup Documentation
**Goal**: Any developer can find, read, and follow documentation to deploy the server on their platform of choice without external help
**Depends on**: Phase 10
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. README provides a clear project overview and a quickstart section that gets a developer from clone to running server with minimal steps
  2. A Linux/VPS guide walks through Ubuntu/Debian environment setup (Node.js, PostgreSQL) through to a working deployment
  3. A Docker guide provides a Dockerfile and docker-compose configuration with annotated steps to run the full stack
  4. A Windows Server guide covers environment setup and deployment steps specific to Windows
**Plans**: TBD

### v2.1 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. KB/Docs Management | 2/2 | Complete | 2026-03-19 |
| 9. Tenant Onboarding Flow | 2/2 | Complete   | 2026-03-19 |
| 10. Dashboard UX Polish | 2/2 | Complete    | 2026-03-19 |
| 11. Setup Documentation | 0/? | Not started | - |

### v2.1 Coverage

| Requirement | Phase |
|-------------|-------|
| KB-01 | Phase 8 |
| KB-02 | Phase 8 |
| KB-03 | Phase 8 |
| KB-04 | Phase 8 |
| KB-05 | Phase 8 |
| ONBOARD-01 | Phase 9 |
| ONBOARD-02 | Phase 9 |
| ONBOARD-03 | Phase 9 |
| UX-01 | Phase 10 |
| UX-02 | Phase 10 |
| UX-03 | Phase 10 |
| UX-04 | Phase 10 |
| DOCS-01 | Phase 11 |
| DOCS-02 | Phase 11 |
| DOCS-03 | Phase 11 |
| DOCS-04 | Phase 11 |

**Coverage: 16/16 requirements mapped**

---

## All-Time Progress

| Milestone | Phases | Plans | Requirements | Status |
|-----------|--------|-------|-------------|--------|
| v1.0 Core MCP Server | 4 | 16 | 39/40 | Complete 2026-03-17 |
| v2.0 Admin Dashboard + Write Ops | 3 | 7 | 26/26 | Complete 2026-03-18 |
| v2.1 UI Polish + Setup Docs | 4 | 6+ | 8/16 | In Progress |

**Total shipped:** 9 phases, 27 plans, 73/74 requirements (KB-08 deferred)

---
*Roadmap created: 2026-03-07*
*v1.0 complete: 2026-03-17*
*v2.0 complete: 2026-03-18*
*v2.1 roadmap created: 2026-03-19*
