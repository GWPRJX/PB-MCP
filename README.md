# PB MCP -- Multi-Tenant ERP MCP Server

Give AI assistants access to your ERP data. Multi-tenant, PostgreSQL-backed, MCP Streamable HTTP.

---

## Overview

PB MCP exposes POSibolt ERP operations (inventory, orders, invoices, contacts) and YouTrack knowledge base articles as MCP tools so AI assistants like Claude and Cursor can answer questions and take actions against live business data. One server instance supports multiple companies ("tenants"), with data kept strictly isolated by PostgreSQL Row-Level Security. Clients connect via MCP Streamable HTTP transport using a per-tenant API key. An admin dashboard (React) provides a GUI for managing tenants, API keys, per-key tool permissions, ERP configuration, and audit logs.

---

## Available Tools

| Category | Tools | Examples |
|----------|-------|----------|
| Inventory | 7 | `list_products`, `get_product`, `search_products`, `list_stock_levels`, `list_low_stock`, ... |
| Orders & Invoices | 6 | `list_orders`, `get_order`, `list_invoices`, `get_invoice`, `list_overdue_invoices`, ... |
| CRM / Contacts | 5 | `list_contacts`, `search_contacts`, `get_contact`, `get_contact_orders`, ... |
| Knowledge Base | 3 | `search_kb`, `get_kb_article`, `get_kb_sync_status` |
| **Total** | **21** | |

Tool access is configurable per-tenant and per-API-key.

---

## Architecture

- **Stack:** Node.js 22 LTS, TypeScript (ESM), Fastify 5, PostgreSQL 17, `@modelcontextprotocol/sdk` 1.27+
- **Tenant isolation:** PostgreSQL Row-Level Security (RLS) on a shared schema -- each tenant's rows are invisible to other tenants at the database layer
- **Auth (MCP clients):** API-key-per-tenant, SHA-256 hashed at rest, optional expiry
- **Auth (dashboard):** JWT HS256 via built-in Node.js crypto, 8-hour default expiry
- **Transport:** MCP Streamable HTTP (not stdio) -- use the `url` field in MCP client config, not `command`/`args`
- **Logging:** All output goes to stderr. stdout is never written to -- MCP uses stdout as its wire protocol and any writes would corrupt it
- All 21 tool calls are audit-logged (fire-and-forget, non-blocking)

See [HOW_IT_WORKS.md](HOW_IT_WORKS.md) for the full technical reference.

---

## Quickstart

The fastest path is Docker. You need Docker Engine 24+ and Docker Compose v2+.

```bash
git clone <your-repo-url> pb-mcp
cd pb-mcp

cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, APP_LOGIN_PASSWORD, ADMIN_SECRET, JWT_SECRET
# Generate secrets with: openssl rand -hex 32

# Start PostgreSQL
docker compose -f docker-compose.prod.yml up -d postgres

# Run migrations (10 migrations: roles, tables, RLS policies)
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate

# Set app_login password (must match APP_LOGIN_PASSWORD in .env)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d pb_mcp -c "ALTER ROLE app_login PASSWORD 'your-app-login-password';"

# Grant table permissions
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d pb_mcp -c "
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;"

# Build and start the application
docker compose -f docker-compose.prod.yml up -d app
```

Open `http://localhost:3000/dashboard/` to create your first tenant.

> **Note:** The server logs nothing to stdout. All output goes to stderr -- this is required for MCP Streamable HTTP transport.

See the [Docker guide](docs/docker.md) for the full annotated walkthrough.

---

## Connecting an AI Client

This server uses **MCP Streamable HTTP** transport. Use the `url` field in your MCP client configuration -- not `command`/`args`.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pb-mcp": {
      "url": "http://YOUR_SERVER:3000/mcp",
      "headers": {
        "X-Api-Key": "pb_your_api_key_here"
      }
    }
  }
}
```

**Cursor:** Same JSON structure, placed in Cursor's MCP configuration file.

**Any MCP client:** Connect to `http://YOUR_SERVER:3000/mcp` with header `X-Api-Key: pb_...`

Replace `YOUR_SERVER` with your server's IP or hostname. API keys are created through the admin dashboard.

---

## Deployment Guides

- [Docker](docs/docker.md) -- recommended for most deployments
- [Linux / VPS (Ubuntu/Debian)](docs/linux-vps.md) -- bare metal or VPS
- [Windows Server](docs/windows-server.md) -- Windows-specific setup
- [Generic setup (any platform)](SETUP.md) -- detailed step-by-step for all platforms

---

## Admin Dashboard

The dashboard at `/dashboard/` provides:

- **Tenant management** -- create and manage company accounts
- **API key management** -- issue keys with optional expiry, revoke, set per-key tool restrictions
- **Tool permissions** -- enable or disable specific MCP tools per tenant
- **ERP configuration** -- set POSibolt connection credentials per tenant
- **Audit logs** -- paginated log of every tool call with status and duration
- **Knowledge base management** -- upload and manage API documentation accessible to AI clients
- **PDF export** -- print tenant setup instructions to PDF

See [SETUP.md](SETUP.md#admin-operations-reference) for the full admin API reference.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 LTS, TypeScript (ESM) |
| HTTP server | Fastify 5 |
| MCP protocol | `@modelcontextprotocol/sdk` 1.27+ |
| Database | PostgreSQL 17 |
| SQL client | postgres.js 3.4 |
| ORM | Drizzle ORM 0.45 (type generation; queries use raw postgres.js) |
| Migrations | golang-migrate v4.19.1 (static binary) |
| Validation | Zod 3.25 |
| Dev runtime | tsx (TypeScript execution without pre-compiling) |
| Dashboard | React 19, Vite, Tailwind CSS v4 |

---

## License

[Add your license here]
