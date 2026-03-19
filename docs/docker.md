# Docker Deployment Guide

How to deploy PB MCP using Docker and Docker Compose. This is the fastest path from clone to running server.

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2+ (included with Docker Desktop) | `docker compose version` |
| Git | any | `git --version` |

---

## Step 1 -- Clone the repository

```bash
git clone <your-repo-url> pb-mcp
cd pb-mcp
```

---

## Step 2 -- Create the .env file

```bash
cp .env.example .env
```

Open `.env` and set these values:

| Variable | What to set | How to generate |
|----------|------------|-----------------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password | `openssl rand -hex 16` |
| `APP_LOGIN_PASSWORD` | Application database user password | `openssl rand -hex 16` |
| `ADMIN_SECRET` | Admin API + dashboard login password | `openssl rand -hex 32` |
| `JWT_SECRET` | JWT signing key | `openssl rand -hex 32` |

The remaining variables have sensible defaults. YouTrack variables are optional -- the server starts without them.

> **Important:** `APP_LOGIN_PASSWORD` must match the password you set in Step 4 below.

---

## Step 3 -- Start PostgreSQL

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

Wait for the health check to pass:

```bash
docker compose -f docker-compose.prod.yml ps
# postgres should show "healthy"
```

---

## Step 4 -- Run database migrations

```bash
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
```

This runs all 10 migrations (roles, tables, RLS policies). Expected output ends with `no change`.

**Set the app_login password** (must match `APP_LOGIN_PASSWORD` in your `.env`):

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d pb_mcp -c "ALTER ROLE app_login PASSWORD 'YOUR_APP_LOGIN_PASSWORD';"
```

**Grant table permissions:**

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d pb_mcp -c "
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
  "
```

---

## Step 5 -- Build and start the application

```bash
docker compose -f docker-compose.prod.yml up -d app
```

The first run builds the Docker image (installs dependencies, builds the dashboard). This takes 1-2 minutes.

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Expected output (on stderr):

```
[kb/scheduler] Starting KB auto-sync every 1800000ms
[pb-mcp] Server listening on http://0.0.0.0:3000
[pb-mcp] Admin UI: http://0.0.0.0:3000/docs
```

> **Note:** The server prints nothing to stdout. All output goes to stderr. This is required -- MCP uses stdout as its wire protocol.

---

## Step 6 -- Verify the deployment

Open the admin dashboard:

```
http://localhost:3000/dashboard/
```

Log in with username `admin` (or your `ADMIN_USERNAME`) and the `ADMIN_SECRET` value as the password.

Create your first tenant using the dashboard or curl:

```bash
curl -s -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"name": "Acme Corp", "slug": "acme", "plan": "standard"}' | jq .
```

Save the returned `apiKey` -- it is shown only once.

---

## Step 7 -- Connect an AI client

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pb-mcp": {
      "url": "http://YOUR_SERVER_IP:3000/mcp",
      "headers": {
        "X-Api-Key": "pb_your_api_key_here"
      }
    }
  }
}
```

Replace `YOUR_SERVER_IP` with your server's IP or hostname.

---

## Updating

To update to a new version:

```bash
git pull
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
docker compose -f docker-compose.prod.yml up -d app
```

---

## Stopping and cleanup

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Stop and remove data volumes (destroys database!)
docker compose -f docker-compose.prod.yml down -v
```

---

## Troubleshooting

### "password authentication failed for user app_login"
The password in `DATABASE_URL` (set via `APP_LOGIN_PASSWORD` in `.env`) does not match the role password. Re-run the ALTER ROLE command from Step 4.

### "permission denied for table products"
The grants from Step 4 are missing. Re-run the GRANT commands.

### Dashboard returns 404
The Docker image may not have built the dashboard. Rebuild: `docker compose -f docker-compose.prod.yml build --no-cache app`

### Container keeps restarting
Check logs: `docker compose -f docker-compose.prod.yml logs app`. Common cause: missing required env vars (`DATABASE_URL`, `ADMIN_SECRET`, `JWT_SECRET`).
