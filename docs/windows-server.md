# Windows Server Deployment Guide

How to deploy PB MCP on Windows Server or Windows desktop. This guide covers installing prerequisites using PowerShell, then directs you to [SETUP.md](../SETUP.md) for the platform-agnostic configuration and startup steps.

All commands use PowerShell syntax. Run PowerShell as Administrator for installation steps.

---

## Prerequisites

| Requirement | Version | Install section below |
|-------------|---------|----------------------|
| Node.js | 22 LTS | Step 1 |
| npm | 10+ (included with Node.js 22) | Step 1 |
| PostgreSQL | 15+ (17 recommended) | Step 2 |
| golang-migrate | v4.19.1 | Step 3 |
| Git | any | `winget install Git.Git` |

---

## Step 1 -- Install Node.js 22

```powershell
# Option A: winget (recommended)
winget install OpenJS.NodeJS.LTS

# Option B: Download installer from https://nodejs.org/en/download/

# Verify (open a new PowerShell window after install)
node --version   # v22.x.x
npm --version    # 10.x.x
```

> **Note:** After installing Node.js, close and reopen PowerShell so the PATH update takes effect.

---

## Step 2 -- Install PostgreSQL

```powershell
# Option A: winget
winget install PostgreSQL.PostgreSQL.17

# Option B: Download installer from https://www.postgresql.org/download/windows/
```

> **Note:** The installer will ask you to set a password for the `postgres` superuser. Remember this password -- you will need it for the `.env` file.

After installation:

```powershell
# Verify PostgreSQL is running
pg_isready
# Should output: localhost:5432 - accepting connections

# If not running, start the service
Start-Service postgresql-x64-17
```

---

## Step 3 -- Install golang-migrate

```powershell
# Download the Windows binary
Invoke-WebRequest -Uri "https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.windows-amd64.zip" -OutFile migrate.zip

# Extract
Expand-Archive migrate.zip -DestinationPath "C:\Program Files\migrate"

# Add to PATH (run as Administrator)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\migrate", [EnvironmentVariableTarget]::Machine)

# Open a new PowerShell window, then verify
migrate --version
```

> **Note:** You must open a new PowerShell window after modifying PATH for the change to take effect. If `migrate --version` still fails, verify that `C:\Program Files\migrate\migrate.exe` exists.

---

## Step 4 -- Clone and install dependencies

```powershell
git clone <your-repo-url> pb-mcp
cd pb-mcp
npm ci
```

---

## Step 5 -- Create the database

```powershell
# Connect as postgres superuser
psql -U postgres

# Inside psql:
CREATE DATABASE pb_mcp;
\q
```

---

## Step 6 -- Create the .env file

```powershell
Copy-Item .env.example .env
```

Open `.env` in a text editor and set the values. See [SETUP.md Step 4](../SETUP.md#step-4--create-the-env-file) for a detailed explanation of each variable.

Generate secrets in PowerShell:

```powershell
# Generate a random secret (equivalent to openssl rand -hex 32)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

---

## Step 7 -- Continue with SETUP.md

From here, follow [SETUP.md](../SETUP.md) starting at **Step 5 -- Run database migrations**. The migration commands, post-migration grants, and server startup steps work identically on Windows.

PowerShell-specific notes for the steps in SETUP.md:

```powershell
# Run migrations (same command -- npm scripts work cross-platform)
npm run migrate:up

# Set app_login password (adjust password to match DATABASE_URL in .env)
psql $env:DATABASE_MIGRATION_URL -c "ALTER ROLE app_login PASSWORD 'your-password';"

# Grant permissions
psql $env:DATABASE_MIGRATION_URL -c "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;"

# Start the server
node --import tsx/esm src/index.ts
```

> **Note on environment variables:** PowerShell uses `$env:VARIABLE_NAME` to read environment variables. The `.env` file is loaded by the server's `dotenv` library at startup, so you do not need to export variables manually.

---

## Running as a Windows Service

### Option A: NSSM (recommended)

```powershell
# Install NSSM
winget install NSSM.NSSM

# Install the service
nssm install pb-mcp "C:\Program Files\nodejs\node.exe" "--import" "tsx/esm" "src/index.ts"
nssm set pb-mcp AppDirectory "C:\path\to\pb-mcp"
nssm set pb-mcp AppEnvironmentExtra "NODE_ENV=production"
nssm set pb-mcp AppStdout "C:\path\to\pb-mcp\logs\stdout.log"
nssm set pb-mcp AppStderr "C:\path\to\pb-mcp\logs\stderr.log"

# The service reads .env via dotenv, but set critical vars as service env too:
nssm set pb-mcp AppEnvironmentExtra +DATABASE_URL=postgres://app_login:password@localhost:5432/pb_mcp
nssm set pb-mcp AppEnvironmentExtra +ADMIN_SECRET=your-secret
nssm set pb-mcp AppEnvironmentExtra +JWT_SECRET=your-jwt-secret

# Start the service
nssm start pb-mcp

# Check status
nssm status pb-mcp
```

### Option B: Task Scheduler

For simpler setups, create a scheduled task that runs at system startup:

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "--import tsx/esm src/index.ts" -WorkingDirectory "C:\path\to\pb-mcp"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "PB-MCP" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest
```

> **Note:** NSSM is preferred because it provides automatic restart on failure, log rotation, and service management via `nssm restart pb-mcp`.

---

## Firewall

```powershell
# Allow inbound connections on port 3000
New-NetFirewallRule -DisplayName "PB MCP Server" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

> **Note:** Only add this rule if the server needs to be accessed from other machines on the network.

---

## Troubleshooting

**"migrate: command not found"** or **"'migrate' is not recognized"** -- golang-migrate is not on PATH. Verify `C:\Program Files\migrate\migrate.exe` exists and the folder is in your system PATH. Open a new PowerShell window after PATH changes.

**"psql: connection refused"** -- PostgreSQL service is not running:
```powershell
Start-Service postgresql-x64-17
```
(Version number in the service name may vary -- check Services in Task Manager.)

**"permission denied for table"** -- missing grants: re-run the GRANT commands from [SETUP.md Step 5](../SETUP.md#step-5--run-database-migrations)

**"password authentication failed for user app_login"** -- ALTER ROLE password does not match `DATABASE_URL` in `.env`

**Server starts but dashboard returns 404** -- dashboard not built. Run:
```powershell
cd dashboard
npm ci
npm run build
cd ..
```
Then restart the server.

**"EACCES: permission denied"** -- if running Node.js as a service, ensure the service account has read access to the project directory and `.env` file.
