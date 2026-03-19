# Linux / VPS Deployment Guide (Ubuntu/Debian)

How to deploy PB MCP on an Ubuntu or Debian server. This guide covers installing prerequisites, then directs you to [SETUP.md](../SETUP.md) for the platform-agnostic configuration and startup steps.

Tested on: Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12

---

## Prerequisites

| Requirement | Version | Install section below |
|-------------|---------|----------------------|
| Node.js | 22 LTS | Step 1 |
| npm | 10+ (included with Node.js 22) | Step 1 |
| PostgreSQL | 15+ (17 recommended) | Step 2 |
| golang-migrate | v4.19.1 | Step 3 |
| Git | any | `sudo apt install git` |

---

## Step 1 -- Install Node.js 22

```bash
# Option A: NodeSource PPA (recommended)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # v22.x.x
npm --version    # 10.x.x
```

```bash
# Option B: nvm (if you need multiple Node versions)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

---

## Step 2 -- Install PostgreSQL

```bash
# Ubuntu 24.04 ships PostgreSQL 16. For PostgreSQL 17:
# Add the official PGDG repository
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
sudo apt update
sudo apt install -y postgresql-17

# OR: Use the system default (PostgreSQL 14 on Ubuntu 22.04, 16 on 24.04)
# Both work -- PostgreSQL 15+ is recommended but 14 is functional
sudo apt install -y postgresql postgresql-contrib
```

```bash
# Verify
psql --version
sudo systemctl status postgresql
```

> **Note:** Ubuntu 22.04 ships PostgreSQL 14. While PB MCP works with PostgreSQL 14, version 15+ is recommended for full RLS feature support. To install 17 on Ubuntu 22.04, use the PGDG repository above.

---

## Step 3 -- Install golang-migrate

```bash
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/migrate

# Verify
migrate --version
```

---

## Step 4 -- Clone and install dependencies

```bash
git clone <your-repo-url> pb-mcp
cd pb-mcp
npm ci
```

---

## Step 5 -- Create the database

```bash
sudo -u postgres psql -c "CREATE DATABASE pb_mcp;"
```

---

## Step 6 -- Continue with SETUP.md

From here, follow [SETUP.md](../SETUP.md) starting at **Step 4 -- Create the .env file**. The remaining steps (environment configuration, migrations, post-migration grants, starting the server) are platform-agnostic.

Direct link: [SETUP.md Step 4](../SETUP.md#step-4--create-the-env-file)

---

## Running as a systemd service

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

Then:

```bash
sudo cp pb-mcp.service /etc/systemd/system/pb-mcp.service
# Edit the file: replace youruser, /path/to/pb-mcp with real values
sudo systemctl daemon-reload
sudo systemctl enable pb-mcp
sudo systemctl start pb-mcp

# Check status and logs
sudo systemctl status pb-mcp
sudo journalctl -u pb-mcp -f
```

---

## Firewall

```bash
# If using ufw (Ubuntu default firewall)
sudo ufw allow 3000/tcp
```

> **Note:** Only open port 3000 if the server needs to be accessed from outside the machine. If running behind a reverse proxy (nginx, caddy), the proxy handles external access and this port can stay closed.

---

## Troubleshooting

**"psql: error: connection refused"** -- PostgreSQL not running:
```bash
sudo systemctl start postgresql
```

**"permission denied for table"** -- missing grants: re-run GRANT commands from [SETUP.md Step 5](../SETUP.md#step-5--run-database-migrations)

**"password authentication failed for user app_login"** -- ALTER ROLE password does not match DATABASE_URL: re-run the ALTER ROLE command from [SETUP.md Step 5](../SETUP.md#step-5--run-database-migrations)

**Server not starting via systemd** -- check logs for the actual error:
```bash
sudo journalctl -u pb-mcp -n 50
```
Common causes: wrong `WorkingDirectory` path or missing `.env` file.
