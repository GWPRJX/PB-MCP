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

## Step 5 -- Build the dashboard UI

The dashboard must be built on the host before starting the application. The server serves static files from `dashboard/dist/`, and in dev mode that folder is volume-mounted into the container.

```bash
# Build the dashboard UI (required — the server serves static files from dashboard/dist/)
cd dashboard && npm install --legacy-peer-deps && npm run build && cd ..
```

> **Development mode note:** `docker-compose.yml` (the dev compose file) volume-mounts `src/` for hot reload. It also volume-mounts `dashboard/dist/` so the container serves your locally-built dashboard assets. Because of this mount, you must build the dashboard on the host (above) before starting the container — changes to the source inside the container are not used. The current `docker-compose.yml` already has the `dashboard/dist/` mount configured.

---

## Step 6 -- Build and start the application

```bash
docker compose -f docker-compose.prod.yml up -d app
```

The first run builds the Docker image (installs dependencies). This takes 1-2 minutes.

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

## Step 7 -- Verify the deployment

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

## Step 8 -- Connect an AI client

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

## Networking & Firewall

The application listens on port 3000. On a server with a firewall you must explicitly allow traffic to reach it.

**UFW (Ubuntu/Debian):**

```bash
sudo ufw allow 3000/tcp
```

**Alternative -- reverse proxy on port 80/443:**

Use Caddy or nginx to proxy requests from port 80 (or 443 with TLS) to `localhost:3000`. This avoids exposing port 3000 directly and lets you add HTTPS.

**Docker-specific: DOCKER-USER iptables chain**

When the kernel's `FORWARD` chain default policy is `DROP` (common on hardened hosts), Docker port mappings are silently blocked unless the `DOCKER-USER` chain has a `RETURN` rule that lets traffic pass.

```bash
# Check if DOCKER-USER chain is empty (causes all Docker port mappings to be blocked)
sudo iptables -L DOCKER-USER -n
# If empty, add RETURN rule:
sudo iptables -A DOCKER-USER -j RETURN
```

This rule persists until reboot. To make it permanent use `iptables-persistent` or add it to your server's startup scripts.

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
The dashboard has not been built. Run the build step from Step 5:
```bash
cd dashboard && npm install --legacy-peer-deps && npm run build && cd ..
```
Then restart the container: `docker compose -f docker-compose.prod.yml up -d app`

### Can't access from external IP
Two common causes:

1. **UFW firewall** -- port 3000 is not open. Run: `sudo ufw allow 3000/tcp`
2. **DOCKER-USER iptables chain is empty** -- all Docker port mappings are blocked by the kernel `FORWARD` DROP policy. Check and fix:
   ```bash
   sudo iptables -L DOCKER-USER -n
   # If empty:
   sudo iptables -A DOCKER-USER -j RETURN
   ```

### Container keeps restarting
Check logs: `docker compose -f docker-compose.prod.yml logs app`. Common cause: missing required env vars (`DATABASE_URL`, `ADMIN_SECRET`, `JWT_SECRET`).
