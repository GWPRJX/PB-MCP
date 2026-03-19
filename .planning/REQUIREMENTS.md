# Requirements: PB MCP

**Defined:** 2026-03-19
**Core Value:** Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

## v2.1 Requirements

Requirements for v2.1 release. Each maps to roadmap phases.

### KB/Docs Management

- [ ] **KB-01**: Admin can configure YouTrack connection settings (API key, base URL, project) from the dashboard
- [ ] **KB-02**: Admin can trigger manual YouTrack sync from dashboard via sync button
- [ ] **KB-03**: Dashboard shows last sync timestamp, article count, and success/failure status
- [ ] **KB-04**: Admin can manually upload API docs at server level to fill gaps not covered by YouTrack sync
- [ ] **KB-05**: Uploaded docs are searchable via MCP KB tools alongside YouTrack-synced articles

### Tenant Onboarding

- [ ] **ONBOARD-01**: Tenant creation flow prompts for ERP credentials first
- [ ] **ONBOARD-02**: ERP connection is tested before proceeding to API key generation
- [ ] **ONBOARD-03**: API key is only generated after successful ERP connection test

### Dashboard UX

- [ ] **UX-01**: Dashboard shows MCP client setup instructions (URL, API key, where to add them)
- [ ] **UX-02**: Setup instructions cover Claude Desktop, Cursor, and generic MCP client
- [ ] **UX-03**: Admin can export per-tenant branded PDF with setup + usage instructions (tenant name, MCP URL, masked API key)
- [ ] **UX-04**: Tooltips added for all technical terms (API key, slug, tool permissions, ERP config, etc.)

### Documentation

- [ ] **DOCS-01**: README overhauled with clear project overview and quickstart
- [ ] **DOCS-02**: Step-by-step setup guide for Linux/VPS (Ubuntu/Debian + Node.js + PostgreSQL)
- [ ] **DOCS-03**: Step-by-step setup guide for Docker (Dockerfile + docker-compose)
- [ ] **DOCS-04**: Step-by-step setup guide for Windows Server

## Future Requirements

None — v2.1 is a polish/documentation milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New MCP tools | No new tools in v2.1 — this is UX/docs only |
| Database schema changes | No data model changes needed |
| Multi-language docs | English only for now |
| Video tutorials | Written guides sufficient for v2.1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| KB-01 | Phase 8 | Pending |
| KB-02 | Phase 8 | Pending |
| KB-03 | Phase 8 | Pending |
| KB-04 | Phase 8 | Pending |
| KB-05 | Phase 8 | Pending |
| ONBOARD-01 | Phase 9 | Pending |
| ONBOARD-02 | Phase 9 | Pending |
| ONBOARD-03 | Phase 9 | Pending |
| UX-01 | Phase 10 | Pending |
| UX-02 | Phase 10 | Pending |
| UX-03 | Phase 10 | Pending |
| UX-04 | Phase 10 | Pending |
| DOCS-01 | Phase 11 | Pending |
| DOCS-02 | Phase 11 | Pending |
| DOCS-03 | Phase 11 | Pending |
| DOCS-04 | Phase 11 | Pending |

**Coverage:**
- v2.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after Phase 8 scope revision — 16 requirements mapped*
