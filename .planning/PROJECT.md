# PB MCP

## What This Is

A multi-tenant ERP MCP server that lets small businesses connect AI tools (Claude Desktop, Cursor, etc.) to manage their inventory, orders, and customer relationships through natural language. Each business (tenant) gets isolated data in PostgreSQL, provisioned and managed via an admin API and React dashboard. The server also provides a searchable knowledge base of POSibolt API documentation.

## Core Value

Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

## Current State

**Latest shipped version:** v2.0 (2026-03-18)

**What's live:**
- 27 MCP tools (21 read + 6 write) across Inventory, Orders, CRM, KB, and Write domains
- PostgreSQL RLS tenant isolation with per-tenant tool access control
- Audit logging on all tool calls (fire-and-forget, queryable via admin API)
- JWT-authenticated React admin dashboard (tenants, keys, tools, ERP config, audit log, API docs)
- API key auth with optional expiry for MCP clients
- YouTrack KB sync + admin doc upload (DOC-* prefix, searchable via MCP tools)
- Write tools: stock transfers, invoice creation/cancellation, contact CRUD via POSibolt POST API

**Tech stack:** TypeScript, Node.js 22 LTS, Fastify 5, PostgreSQL + RLS, Drizzle ORM, MCP SDK 1.27.x, React + Vite + Tailwind (dashboard)

## Milestones

### v1.0 — Core MCP Server (COMPLETE 2026-03-17)

Read-only MCP server with 21 tools, PostgreSQL RLS tenant isolation, API key auth, YouTrack KB sync. 4 phases, 16 plans, 39/40 requirements delivered. KB-08 (self-configuration) deferred.

### v2.0 — Admin Dashboard + Write Operations (COMPLETE 2026-03-18)

Tool access control, audit logging, JWT dashboard auth, API key expiry, React admin dashboard, API doc upload, 6 MCP write tools. 3 phases, 7 plans, 26/26 requirements delivered.

### v2.1 — UI Polish + Setup Documentation (IN PROGRESS)

**Goal:** Make the server easy to set up and use for anyone — polish dashboard UX, fix KB docs management, improve tenant onboarding flow, and provide comprehensive setup documentation.

**Target features:**
- Server-level API doc management with manual YT sync
- Guided tenant onboarding (credentials-first, test-before-key)
- Per-tenant PDF export with MCP client setup instructions
- Tooltips for all technical terms in dashboard
- README overhaul + deployment guides (Linux, Docker, Windows)

## Constraints

- **Platform**: MCP (Model Context Protocol) — compatible with Claude Desktop, Cursor, and other MCP clients
- **Database**: PostgreSQL with RLS — tenant isolation at database layer
- **ERP**: POSibolt REST API — all inventory/order/contact operations go through live API
- **Logging**: stderr only — stdout must never receive writes (MCP transport corruption)

## Out of Scope

| Feature | Reason |
|---------|--------|
| HR / Payroll module | Deferred — not in v1/v2 scope, high complexity |
| Mobile app | Web-first; mobile is a future milestone |
| Real-time collaborative editing | Not needed for AI-assistant use case |
| OAuth 2.1 for MCP clients | API keys with expiry sufficient for M2M usage |
| KB-08 self-configuration | Deferred indefinitely — upload-based doc management replaces this |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-19 — v2.1 milestone started*
