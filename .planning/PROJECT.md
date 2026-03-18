# PB MCP

## What This Is

A multi-tenant ERP MCP server that lets small businesses connect AI tools (Claude Desktop, Cursor, etc.) to manage their inventory, orders, and customer relationships through natural language. Each business (tenant) gets isolated data in PostgreSQL, provisioned and managed via an admin API and dashboard. The server also provides a searchable knowledge base of POSibolt API documentation.

## Core Value

Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

## Milestones

### v1.0 — Core MCP Server (COMPLETE 2026-03-17)

Read-only MCP server with 21 tools, PostgreSQL RLS tenant isolation, API key auth, YouTrack KB sync. 4 phases, 16 plans, 39/40 requirements delivered. KB-08 (self-configuration) deferred.

### v2.0 — Admin Dashboard + Write Operations (ACTIVE)

Theme: UI/UX + production readiness. Three phases:

1. **Phase 5: Backend Services** — Tool access control, audit logging, JWT dashboard auth, API key expiry, tests
2. **Phase 6: Admin Dashboard + Doc Upload** — React admin UI (Vite + Tailwind), API doc upload/management, production build serving
3. **Phase 7: Write Tools** — MCP write tools for stock, invoices, contacts via POSibolt API

26 requirements across TAC (5), AUTH (2), DASH (9), UPLOAD (4), WRITE (6).

## Requirements

### Validated (v1 — shipped and verified)

- [x] Multi-tenant MCP server with per-tenant data isolation (PostgreSQL RLS)
- [x] Admin REST API to provision and manage tenant organizations
- [x] MCP tools for Inventory & Products (read-only, 7 tools)
- [x] MCP tools for Orders & Billing (read-only, 6 tools)
- [x] MCP tools for CRM / Contacts (read-only, 5 tools)
- [x] AI clients authenticate per-tenant via API key (SHA-256 hashed)
- [x] YouTrack KB sync — pulls API docs on refresh and schedule
- [x] AI clients can query KB content (search_kb, get_kb_article, get_kb_sync_status)
- [x] Developer onboarding: clone → add tenant → running MCP server in <10 min

### Active (v2)

- [ ] Per-tenant tool access control (enable/disable tools, per-key scoping)
- [ ] Audit logging of all MCP tool calls
- [ ] JWT-based dashboard authentication (replace raw admin secret)
- [ ] API key expiry support
- [ ] React admin dashboard (tenants, keys, tools, ERP config, audit, docs)
- [ ] API doc upload/management through dashboard
- [ ] MCP write tools: stock entries, invoices, contacts (via POSibolt API)

### Out of Scope

- HR / Payroll — deferred to future milestone
- Mobile app — web-first, mobile later
- Real-time collaborative editing — complexity not justified
- OAuth 2.1 — API keys with expiry sufficient for current M2M usage
- KB-08 self-configuration — replaced by doc upload approach

## Context

- **Stack:** TypeScript / Node.js 22 LTS, Fastify 5, PostgreSQL with RLS, MCP SDK 1.27.x
- **Frontend:** React + Vite + Tailwind CSS (dashboard)
- **ERP integration:** Tools call POSibolt REST API live via OAuth token (not local DB)
- **Auth:** API keys for MCP clients, JWT for dashboard admin
- **POSibolt client:** `pbGet`/`pbPost` with per-tenant OAuth token caching

## Constraints

- **Platform**: MCP (Model Context Protocol) — compatible with Claude Desktop, Cursor, and other MCP clients
- **Database**: PostgreSQL with RLS — tenant isolation at database layer
- **ERP**: POSibolt REST API — all inventory/order/contact operations go through live API
- **Logging**: stderr only — stdout must never receive writes (MCP transport corruption)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PostgreSQL RLS over per-schema | Migration overhead, shared schema simpler | Implemented v1 |
| API keys over OAuth 2.1 | Simpler for M2M; expiry in v2 covers security gap | Implemented v1, expiry in v2 |
| Live POSibolt API over local DB | Single source of truth; no data sync lag | Implemented v1 |
| JWT for dashboard | Raw admin secret in localStorage insecure | Planned v2 |
| Doc upload over YouTrack sync | Simpler to manage; direct markdown upload | Planned v2 |
| Write tools via POSibolt POST | Same pattern as read tools; audit-logged | Planned v2 |

---
*Last updated: 2026-03-18 — v2.0 milestone scoped*
