# Setup Guide

How to get PB MCP running on a fresh server. Covers prerequisites, database setup, configuration, first tenant, and connecting an AI client.

---

## Prerequisites

You need these installed on the server before starting:

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 22 or later | `node --version` |
| npm | 10 or later | `npm --version` |
| PostgreSQL | 15 or later (17 recommended) | `psql --version` |
| golang-migrate | v4.19.1 | `migrate --version` |
| Git | any | `git --version` |

### Installing golang-migrate (Linux/macOS)

```bash
# Linux x86_64
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/migrate

# macOS (Homebrew)
brew install golang-migrate

# Verify
migrate --version
```

### Installing golang-migrate (Windows)

Download `migrate.windows-amd64.zip` from:
https://github.com/golang-migrate/migrate/releases/tag/v4.19.1

Extract `migrate.exe` and place it somewhere on your PATH (e.g. `C:\Windows\System32\` or a folder listed in your system PATH).

```cmd
migrate --version
```

---

## Step 1 — Clone the repository

```bash
git clone <your-repo-url> pb-mcp
cd pb-mcp
```

---

## Step 2 — Install Node.js dependencies

```bash
npm ci
```

This installs all production and development dependencies from `package-lock.json`. Do not use `npm install` on a server — it may update versions unexpectedly.

---

## Step 3 — Create the PostgreSQL database

Connect to PostgreSQL as a superuser and create the database:

```bash
# Connect as superuser (adjust command for your system)
psql -U postgres

# Inside psql:
CREATE DATABASE pb_mcp;
\q
```

The database name can be anything — just use it consistently in the `.env` file below.

---

## Step 4 — Create the .env file

The repo contains `.env.example` but not `.env`. The `.env` file holds real secrets and is intentionally excluded from git — it must never be committed.

Copy the example and fill in real values:

```bash
cp .env.example .env
```

Open `.env`. Here is what each line means and what to change:

```env
# ── DATABASE ──────────────────────────────────────────────────────────────────

# Application connection — used by the running server for all ERP queries.
# Username is always app_login (created by migration 000001).
# Change the password to something strong — must match what you set in Step 5.
DATABASE_URL=postgres://app_login:CHOOSE_A_STRONG_PASSWORD@localhost:5432/pb_mcp

# Migration connection — PostgreSQL superuser.
# Used for: running migrations, API key auth lookups, admin tenant list queries.
# Change YOUR_POSTGRES_PASSWORD to your actual postgres superuser password.
# WARNING: never commit this file or share this password.
DATABASE_MIGRATION_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/pb_mcp

# Warns on startup if unapplied migrations exist. Leave as true.
MIGRATION_ALERT=true

# ── SERVER ────────────────────────────────────────────────────────────────────

NODE_ENV=production   # use "development" for local dev (enables more verbose errors)
PORT=3000             # change if 3000 is already in use on your server

# Admin API secret — protects all /admin/* endpoints (also used as the login password).
# Generate with: openssl rand -hex 32
# Treat this like a root password — keep it out of logs and chat history.
ADMIN_SECRET=CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET

# Admin login username for the dashboard. Default: admin
ADMIN_USERNAME=admin

# ── JWT (Dashboard Authentication) ───────────────────────────────────────────

# Secret key for signing JWT tokens. Generate with: openssl rand -hex 32
# Required — the server will not start without it.
JWT_SECRET=CHANGE_THIS_TO_A_DIFFERENT_RANDOM_SECRET

# How long JWT tokens remain valid, in hours. Default: 8 (one workday).
JWT_EXPIRY_HOURS=8

# ── YOUTRACK KB SYNC (optional) ───────────────────────────────────────────────

# The server starts fine without these. KB tools return empty results until
# a sync has run. Once set, the server syncs automatically on startup and
# every KB_SYNC_INTERVAL_MS milliseconds after that.

# Your YouTrack instance URL (no trailing slash)
YOUTRACK_BASE_URL=https://support.posibolt.com

# Permanent token from YouTrack → Profile → Hub → Authentication → New token
# Needs at least Read access to Articles in the target project.
YOUTRACK_TOKEN=perm-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# YouTrack project shortName to sync (P8 = POSibolt V8)
YOUTRACK_PROJECT=P8

# How often to auto-sync in milliseconds. 1800000 = 30 minutes.
KB_SYNC_INTERVAL_MS=1800000
```

### What each secret is used for at runtime

| Variable | Used by | If missing |
|----------|---------|-----------|
| `DATABASE_URL` | Every ERP tool query, MCP auth | Server exits immediately |
| `DATABASE_MIGRATION_URL` | Migrations, auth key lookups, admin tenant list | Server exits; auth lookups return 401 |
| `ADMIN_SECRET` | Admin endpoints (auth fallback), dashboard login password | Server exits immediately |
| `JWT_SECRET` | JWT token signing/verification for dashboard auth | Server exits immediately |
| `JWT_EXPIRY_HOURS` | JWT token lifetime | Defaults to 8 hours |
| `ADMIN_USERNAME` | Dashboard login username | Defaults to `admin` |
| `YOUTRACK_TOKEN` | KB sync worker | Sync skips with a warning; server still starts |
| `YOUTRACK_BASE_URL` | KB sync worker | Same as above |

---

## Step 5 — Run database migrations

Migrations create all tables, roles, and RLS policies. Run them as the superuser:

```bash
npm run migrate:up
```

This runs `golang-migrate` against `DATABASE_MIGRATION_URL`. The ten migrations execute in order:

| Migration | What it creates |
|-----------|----------------|
| `000001` | `app_user` (NOLOGIN) and `app_login` (LOGIN) roles |
| `000002` | `tenants` table |
| `000003` | `api_keys` table with RLS policies |
| `000004` | ERP tables: products, stock_levels, suppliers, contacts, orders, order_line_items, invoices — all with RLS |
| `000005` | `kb_articles` table (global cache, no RLS) |
| `000006` | ERP config columns on tenants (erp_base_url, erp_client_id, erp_app_secret, erp_username, erp_password, erp_terminal) |
| `000007` | `tool_permissions` table (RLS) + `allowed_tools` column on api_keys |
| `000008` | `audit_log` table (append-only, RLS) |
| `000009` | `expires_at` column on api_keys (optional key expiry) |
| `000010` | `server_settings` table (key-value store for dashboard-configurable settings) |

**Set the app_login password to match DATABASE_URL:**

Migration 000001 creates `app_login` with a placeholder password. You must update it to match the password in your `DATABASE_URL`:

```bash
psql "$DATABASE_MIGRATION_URL" -c "ALTER ROLE app_login PASSWORD 'CHOOSE_A_STRONG_PASSWORD';"
```

Use the same password you put in `DATABASE_URL`.

**Grant table permissions to app_user:**

The migrations create the roles but you must grant them access to the tables:

```bash
psql "$DATABASE_MIGRATION_URL" -c "
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
"
```

**Verify migrations succeeded:**

```bash
npm run migrate:status
# Should print: Version: 10 (the latest migration number)
```

---

## Step 6 — Verify the test suite (optional but recommended)

Before going live, run the test suite to confirm everything is wired correctly:

```bash
# Set NODE_ENV for tests
export NODE_ENV=test   # or: set NODE_ENV=test on Windows

npm test
```

Expected output: all tests pass across 19 test files (DB, admin, MCP, tools, KB, smoke). If any test fails, the most common cause is a misconfigured database connection or missing role permissions.

---

## Step 7 — Start the server

**Development (auto-restarts on file changes):**
```bash
npm run dev
```

**Production:**
```bash
node --import tsx/esm src/index.ts
```

Or add a `start` script to `package.json`:
```json
"start": "node --import tsx/esm src/index.ts"
```

**Expected startup output (stderr):**
```
[kb/scheduler] Starting KB auto-sync every 1800000ms
[kb/sync] Fetched 50 articles from YouTrack project:P8
[kb/sync] Sync complete: 50 articles stored
[pb-mcp] Server listening on http://0.0.0.0:3000
[pb-mcp] Admin UI: http://0.0.0.0:3000/docs
```

If `YOUTRACK_BASE_URL` or `YOUTRACK_TOKEN` are not set:
```
[kb/scheduler] Starting KB auto-sync every 1800000ms
[kb/sync] WARNING: YOUTRACK_BASE_URL or YOUTRACK_TOKEN not set — skipping sync
[pb-mcp] Server listening on http://0.0.0.0:3000
```

**The server prints nothing to stdout.** All output goes to stderr. This is required — the MCP transport uses stdout as its wire protocol.

---

## Step 8 — Create your first tenant

The server is now running. Create a tenant to get an API key. You can use the dashboard at `http://localhost:3000/dashboard/` or curl:

```bash
curl -s -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"name": "Acme Corp", "slug": "acme", "plan": "standard"}' \
  | jq .
```

Response:
```json
{
  "tenantId": "a1b2c3d4-...",
  "apiKey": "pb_aabbccddeeff..."
}
```

**Save the `apiKey` value.** It is shown exactly once and cannot be retrieved again. If you lose it, revoke it and issue a new one.

---

## Step 9 — Verify MCP tools are accessible

Test that the MCP server accepts the API key and returns the tool list:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: pb_aabbccddeeff..." \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | jq '.result.tools | length'
```

Expected output: `21`

---

## Step 10 — Connect an AI client

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pb-mcp": {
      "url": "http://YOUR_SERVER_IP:3000/mcp",
      "headers": {
        "X-Api-Key": "pb_aabbccddeeff..."
      }
    }
  }
}
```

Replace `YOUR_SERVER_IP` with your server's IP or hostname, and use the API key from Step 8.

### MCP Inspector (testing)

Open MCP Inspector in a browser and connect to:
- URL: `http://localhost:3000/mcp`
- Transport: Streamable HTTP
- Custom header: `X-Api-Key: pb_aabbccddeeff...`

---

## Admin Operations Reference

Admin endpoints accept either `Authorization: Bearer JWT_TOKEN` or `X-Admin-Secret: YOUR_ADMIN_SECRET` header.

### Login (get a JWT token)

```bash
curl -s -X POST http://localhost:3000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "YOUR_ADMIN_SECRET"}' | jq .
# Returns: { "token": "eyJ..." }
```

Use the returned token as `Authorization: Bearer TOKEN` for all subsequent requests.

### List all tenants

```bash
curl -s http://localhost:3000/admin/tenants \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Get a specific tenant

```bash
curl -s http://localhost:3000/admin/tenants/TENANT_ID \
  -H "Authorization: Bearer TOKEN" | jq .
```

Returns tenant details including API keys with `expiresAt` and `allowedTools` fields.

### Issue an additional API key

```bash
curl -s -X POST http://localhost:3000/admin/tenants/TENANT_ID/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"label": "Claude Desktop - Production", "expiresAt": "2026-12-31T23:59:59Z"}' | jq .
```

`expiresAt` is optional — omit it for keys that never expire.

### Revoke an API key

```bash
curl -s -X DELETE http://localhost:3000/admin/tenants/TENANT_ID/keys/KEY_ID \
  -H "Authorization: Bearer TOKEN"
# Returns 204 No Content on success
```

### Manage tool permissions

```bash
# Get current permissions
curl -s http://localhost:3000/admin/tenants/TENANT_ID/tools \
  -H "Authorization: Bearer TOKEN" | jq .

# Update permissions (disable specific tools)
curl -s -X PUT http://localhost:3000/admin/tenants/TENANT_ID/tools \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"tools": {"list_products": true, "get_product": true, "list_orders": false}}' | jq .

# Set per-key tool restrictions (null = inherit tenant defaults)
curl -s -X PUT http://localhost:3000/admin/tenants/TENANT_ID/keys/KEY_ID/tools \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"allowedTools": ["list_products", "get_product"]}' | jq .
```

### Configure ERP connection

```bash
curl -s -X PUT http://localhost:3000/admin/tenants/TENANT_ID/erp-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"erpBaseUrl": "https://erp.example.com", "erpClientId": "...", "erpAppSecret": "...", "erpUsername": "...", "erpPassword": "...", "erpTerminal": "..."}' | jq .

# Test the connection
curl -s -X POST http://localhost:3000/admin/tenants/TENANT_ID/test-connection \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Query audit log

```bash
curl -s "http://localhost:3000/admin/tenants/TENANT_ID/audit-log?limit=25&toolName=list_products&status=success" \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Upload API documentation

```bash
curl -s -X POST http://localhost:3000/admin/kb/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"title": "API Guide", "content": "# Markdown content here", "tags": ["api", "guide"]}' | jq .
```

Uploaded docs are stored in `kb_articles` with a `DOC-*` prefix and are immediately searchable via the `search_kb` and `get_kb_article` MCP tools.

### Trigger immediate KB sync

```bash
curl -s -X POST http://localhost:3000/admin/kb/refresh \
  -H "Authorization: Bearer TOKEN" | jq .
# Returns: { "synced": true, "article_count": 50 }
```

### List all available tools

```bash
curl -s http://localhost:3000/admin/tools \
  -H "Authorization: Bearer TOKEN" | jq .
# Returns: ["list_products", "get_product", ...]
```

### Interactive API docs

Open `http://localhost:3000/docs` in a browser. Scalar generates an interactive UI from the OpenAPI schema — you can test all admin endpoints from there.

### Admin dashboard

Open `http://localhost:3000/dashboard/` in a browser. The React dashboard provides a GUI for all admin operations: managing tenants, API keys (with expiry and per-key tool scoping), tool permissions, ERP configuration, audit logs, and API documentation upload.

---

## Running as a System Service (Linux)

Create `/etc/systemd/system/pb-mcp.service`:

```ini
[Unit]
Description=PB MCP Server
After=network.target postgresql.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/pb-mcp
EnvironmentFile=/path/to/pb-mcp/.env
ExecStart=/usr/bin/node --import tsx/esm src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable pb-mcp
sudo systemctl start pb-mcp
sudo journalctl -u pb-mcp -f   # follow logs
```

---

## Troubleshooting

### "DATABASE_URL environment variable is not set"
The server exits immediately if `DATABASE_URL` is missing. Check that your `.env` file exists and is in the project root directory.

### "ADMIN_SECRET environment variable is not set"
Same as above — `ADMIN_SECRET` is required at startup.

### 401 on admin endpoints
Either the JWT token is expired/invalid, or the `X-Admin-Secret` header doesn't match. Log in again via `POST /admin/auth/login` to get a fresh token.

### 401 on MCP endpoints
Either the API key is wrong, revoked, expired, or the `X-Api-Key` header is missing. Check `GET /admin/tenants/:id` to see key status and `expiresAt`. Expired keys return `"API key expired"`.

### "permission denied for table products" (or similar)
The `app_login` role is missing grants. Run:
```bash
psql "$DATABASE_MIGRATION_URL" -c "
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
"
```

### "password authentication failed for user app_login"
The password in `DATABASE_URL` doesn't match the role password. Run:
```bash
psql "$DATABASE_MIGRATION_URL" -c "ALTER ROLE app_login PASSWORD 'your-new-password';"
```
And update `DATABASE_URL` to match.

### Migration fails: "role app_user already exists"
This is not an error — the migration uses `IF NOT EXISTS`. If it shows a different failure, check that `DATABASE_MIGRATION_URL` is a superuser connection.

### KB sync shows 0 articles
Either `YOUTRACK_BASE_URL` or `YOUTRACK_TOKEN` is not set, or the token is invalid. Test the token manually:
```bash
curl -s "https://your-instance.youtrack.cloud/api/articles?fields=idReadable,summary&query=project:P8&\$top=5" \
  -H "Authorization: Bearer perm-your-token" | jq .
```
If this returns articles, the token is valid. If not, generate a new permanent token in YouTrack → Profile → Hub → Authentication.

### Server stdout has output / MCP client errors
Something is writing to stdout. Fastify's logger must be disabled and `console.log` must not appear anywhere in `src/`. The MCP transport uses stdout as its wire protocol — any other output corrupts it.

---

## Seeding Test Data

For development and demos, seed ERP data directly into the database after creating a tenant:

```bash
# Get your tenant ID first
TENANT_ID=$(curl -s http://localhost:3000/admin/tenants \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" | jq -r '.[0].id')

# Insert sample products
psql "$DATABASE_MIGRATION_URL" <<SQL
BEGIN;
SELECT set_config('app.current_tenant_id', '${TENANT_ID}', true);

INSERT INTO products (tenant_id, sku, name, price, description) VALUES
  ('${TENANT_ID}', 'WID-001', 'Widget A', 29.99, 'Standard widget'),
  ('${TENANT_ID}', 'WID-002', 'Widget B', 49.99, 'Premium widget'),
  ('${TENANT_ID}', 'GAD-001', 'Gadget X', 99.99, 'Electronic gadget');

COMMIT;
SQL
```

Repeat for `contacts`, `orders`, `invoices`, etc. using the same `set_config` pattern inside a transaction.
