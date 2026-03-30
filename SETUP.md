# Setup Guide — Step by Step

This guide walks you through setting up PB MCP from scratch on a fresh server. Follow every step in order. Do not skip steps.

---

## What You Need Before Starting

Install these on your server first. Run the "Check" command to verify each one is installed.

| What | Version | How to check |
|------|---------|-------------|
| Node.js | 22 or newer | `node --version` → should say v22.x.x or higher |
| npm | 10 or newer | `npm --version` → should say 10.x.x or higher |
| PostgreSQL | 15 or newer | `psql --version` → should say 15, 16, or 17 |
| golang-migrate | v4.19.1 | `migrate --version` → should say 4.19.1 |
| Git | any version | `git --version` |

If Node.js is older than v22, the server will not start. Update it before continuing.

### How to install golang-migrate

**Linux:**
```bash
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/migrate
migrate --version
```

**Mac:**
```bash
brew install golang-migrate
migrate --version
```

**Windows:**
1. Go to https://github.com/golang-migrate/migrate/releases/tag/v4.19.1
2. Download `migrate.windows-amd64.zip`
3. Extract `migrate.exe`
4. Put it in a folder that's on your PATH (like `C:\Windows\System32\`)
5. Open a new terminal and run `migrate --version`

---

## Step 1 — Download the code

```bash
git clone <your-repo-url> pb-mcp
cd pb-mcp
```

You should now be inside the `pb-mcp` folder. All commands below assume you are in this folder.

---

## Step 2 — Install dependencies

```bash
npm ci
```

Wait for it to finish. If you see errors about peer dependencies, that's OK as long as it says "added X packages" at the end.

---

## Step 3 — Create the database

You need to create an empty PostgreSQL database. Here's how:

```bash
psql -U postgres
```

This opens the PostgreSQL prompt. Type these commands one at a time:

```sql
CREATE DATABASE pb_mcp;
\q
```

That's it. You now have an empty database called `pb_mcp`.

---

## Step 4 — Create your .env file

The `.env` file holds all your passwords and settings. There is an example file included. Copy it:

```bash
cp .env.example .env
```

Now open the `.env` file in a text editor (nano, vim, VS Code, Notepad — whatever you like):

```bash
nano .env
```

You need to change several values. Here is every single one, explained in plain English:

### Database URLs

```
DATABASE_URL=postgres://app_login:YOUR_APP_PASSWORD@localhost:5432/pb_mcp
```
- Replace `YOUR_APP_PASSWORD` with a strong password you make up right now
- Write this password down — you will need it again in Step 5
- Do NOT change `app_login` — that's a special username the system creates for you
- If your database is on a different server, change `localhost` to that server's IP

```
DATABASE_MIGRATION_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/pb_mcp
```
- Replace `YOUR_POSTGRES_PASSWORD` with your PostgreSQL superuser password
- This is the password you set when you installed PostgreSQL
- If you never set one, try `postgres` as the password

```
MIGRATION_ALERT=true
```
- Leave this as `true`. It warns you if there are unapplied database updates.

### Server Settings

```
NODE_ENV=production
```
- Set to `production` for a real server
- Set to `development` only if you are developing/testing locally

```
PORT=3000
```
- The port the server listens on
- Change this only if port 3000 is already in use on your server

### Admin Login

```
ADMIN_SECRET=paste_a_long_random_string_here
```
- This is your admin password for the dashboard
- Generate one by running this command: `openssl rand -hex 32`
- Copy the output and paste it here
- This is also used to protect all admin API endpoints
- **SAVE THIS PASSWORD somewhere safe** — you need it to log into the dashboard

```
ADMIN_USERNAME=admin
```
- This is your login username for the dashboard
- Change it if you want a different username, or leave it as `admin`

### JWT (Login Tokens)

```
JWT_SECRET=paste_a_different_random_string_here
```
- This must be DIFFERENT from ADMIN_SECRET
- Generate one by running: `openssl rand -hex 32`
- Copy the output and paste it here

```
JWT_EXPIRY_HOURS=8
```
- How long you stay logged in before needing to log in again
- `8` means 8 hours. Change if you want longer/shorter sessions.

### Dashboard Access (CORS)

```
DASHBOARD_ORIGIN=http://your-server-ip-or-domain
```
- If you are accessing the dashboard from a browser on a different machine, set this to the URL you type in the browser
- Examples: `http://102.214.10.177` or `https://mcp.yourcompany.com`
- **No trailing slash** — `http://102.214.10.177` not `http://102.214.10.177/`
- If you are using a reverse proxy (Caddy, nginx) on the same server, you can leave this blank — it works automatically
- If you are only testing on localhost, leave this blank

### ERP Encryption Key

```
ERP_ENCRYPTION_KEY=paste_another_random_string_here
```
- Encrypts your ERP (POSibolt) credentials in the database
- Generate one: `openssl rand -hex 32`
- **Required in production** — the server will not start without it in production mode
- In development mode it's optional (credentials are stored in plain text without it)

### YouTrack Knowledge Base (Optional)

These settings connect to YouTrack to sync knowledge base articles. Skip this section if you don't use YouTrack. You can also set these later from the dashboard.

```
YOUTRACK_BASE_URL=https://your-instance.youtrack.cloud
```
- Your YouTrack URL
- **IMPORTANT: NO trailing slash at the end**
- Correct: `https://support.posibolt.com`
- Wrong: `https://support.posibolt.com/`
- Wrong: `https://support.posibolt.com/api/articles`
- The system automatically adds `/api/articles` to whatever you put here

```
YOUTRACK_TOKEN=perm-xxxxxxxxxxxxxxxxxxxx
```
- Your YouTrack permanent token
- To create one: YouTrack → click your profile picture → Profile → click "Update personal information and manage logins" → Authentication tab → New token
- Give it "Read" access to Articles

```
YOUTRACK_PROJECT=PROJ
```
- The short code of your YouTrack project
- **This must match exactly** — look at any article in your project. If the article ID looks like `POS-42`, then put `POS`. If it looks like `KB-7`, put `KB`.
- If this is wrong, you will get 0 articles synced or an error saying "The value isn't used for the project field"

```
KB_SYNC_INTERVAL_MS=1800000
```
- How often to auto-sync articles, in milliseconds
- `1800000` = 30 minutes. Leave this unless you have a reason to change it.

### Demo Tenant (Development Only)

These auto-create a demo tenant on startup. Only useful for development/testing. Leave as-is or remove for production.

### Summary: What to generate

You need to run `openssl rand -hex 32` three times and paste each result into a different variable:
1. `ADMIN_SECRET` — your dashboard password
2. `JWT_SECRET` — used internally for login tokens
3. `ERP_ENCRYPTION_KEY` — encrypts ERP credentials in the database

**Save your .env file and close the editor.**

---

## Step 5 — Run database migrations

This creates all the tables the server needs:

```bash
npm run migrate:up
```

You should see output like:
```
1/u create_roles
2/u create_tenants
...
12/u add_doc_tool_mappings
```

If you see errors, check that `DATABASE_MIGRATION_URL` in your `.env` is correct and that PostgreSQL is running.

### Now do these two important things:

**A) Set the app_login password:**

The migration created a user called `app_login` but it has a dummy password. You need to set it to match what you put in `DATABASE_URL`:

```bash
psql -U postgres -d pb_mcp -c "ALTER ROLE app_login PASSWORD 'YOUR_APP_PASSWORD';"
```

Replace `YOUR_APP_PASSWORD` with the exact same password you used in the `DATABASE_URL` line in your `.env` file.

**B) Grant permissions:**

The app needs permission to read and write tables. Run this:

```bash
psql -U postgres -d pb_mcp -c "
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
"
```

### Verify everything worked

```bash
npm run migrate:status
```

Should say: `Version: 12`

### Checklist before moving on

- [ ] Migrations ran without errors (12 migrations applied)
- [ ] `app_login` password set (must match DATABASE_URL)
- [ ] Table and sequence grants applied
- [ ] `npm run migrate:status` shows Version: 12

---

## Step 6 — Build the dashboard

The admin dashboard is a separate React app that needs to be built before the server can serve it:

```bash
cd dashboard
npm install --legacy-peer-deps
npm run build
cd ..
```

**If you skip this step**, going to `/dashboard/` in your browser will show a 404 error.

You should see output ending with something like:
```
dist/assets/index-xxxxx.js   835.62 kB
✓ built in 219ms
```

---

## Step 7 — Start the server

**For development** (auto-restarts when you change code):
```bash
npm run dev
```

**For production:**
```bash
node --import tsx/esm src/index.ts
```

You should see output like:
```
Server listening on http://0.0.0.0:3000
```

If you see errors about missing environment variables, go back to Step 4 and check your `.env` file.

### Test that it's working

Open a new terminal and run:
```bash
curl http://localhost:3000/health
```

You should see:
```json
{"status":"healthy","database":"connected","uptime":5.123,"timestamp":"..."}
```

If you see `"database":"disconnected"`, your database password is wrong — go back to Step 5A.

---

## Step 8 — Make it accessible from other computers

Right now the server only works from `localhost`. To access it from your browser on another computer:

### Option A: Open the port in your firewall

```bash
sudo ufw allow 3000/tcp
```

Then access: `http://YOUR_SERVER_IP:3000/dashboard/`

### Option B: Use a reverse proxy (recommended)

If you already have Caddy or nginx running, add a reverse proxy rule:

**Caddy** — add to `/etc/caddy/Caddyfile`:
```
http://YOUR_SERVER_IP {
    reverse_proxy localhost:3000
}
```
Then reload: `sudo systemctl reload caddy`

**nginx** — create `/etc/nginx/sites-available/pbmcp`:
```
server {
    listen 80;
    server_name YOUR_SERVER_IP;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
Then enable and restart:
```bash
sudo ln -sf /etc/nginx/sites-available/pbmcp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

### If using Docker: check iptables

Docker uses iptables for port forwarding. If you can access from localhost but NOT from external IPs, the `DOCKER-USER` chain might be blocking traffic:

```bash
# Check if the chain is empty (this is the problem):
sudo iptables -L DOCKER-USER -n

# If it shows no rules, add this:
sudo iptables -A DOCKER-USER -j RETURN
```

### Still can't access from outside?

- Check if your hosting provider has a separate firewall/security group (AWS, Azure, GCP, etc. all have this)
- Make sure port 80 or 3000 is allowed in that external firewall too
- The server firewall (UFW) is only one layer — your cloud provider may have another

---

## Step 9 — Log into the dashboard

1. Open `http://YOUR_SERVER_IP/dashboard/` in your browser (or `:3000/dashboard/` if not using a reverse proxy)
2. Username: whatever you set for `ADMIN_USERNAME` (default: `admin`)
3. Password: the value you set for `ADMIN_SECRET` in your `.env` file

---

## Step 10 — Create your first tenant

A "tenant" is a company that uses the MCP server. Each tenant gets their own API key and their data is completely separate from other tenants.

### From the dashboard (easiest):
1. Log in (Step 9)
2. Click "Create Tenant"
3. Fill in the company name and slug (short identifier, like `acme`)
4. Click Create
5. **Copy the API key immediately** — it is shown only once and cannot be retrieved later

### From the command line:
```bash
curl -s -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"name": "Acme Corp", "slug": "acme", "plan": "standard"}'
```

---

## Step 11 — Connect an AI client

Use the API key from Step 10 to connect Claude, Cursor, or any MCP client.

**Claude Desktop** — edit `claude_desktop_config.json`:

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

**Test it manually:**
```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: pb_your_api_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

You should see a list of 27 tools in the response.

---

## Step 12 — Configure YouTrack (Optional)

You can set this up from the dashboard instead of the `.env` file:

1. Log into the dashboard
2. Go to Knowledge Base settings
3. Enter your YouTrack URL (NO trailing slash)
4. Enter your permanent token
5. Enter your project short code (the prefix from article IDs — e.g., `POS` if articles are `POS-42`)
6. Click "Test Connection" to verify
7. Click "Sync Now" to pull articles

**Common errors:**
- `"The value isn't used for the project field"` → Wrong project short code. Look at an actual article ID in YouTrack.
- `"non-JSON response"` or `"<!doctype"` error → Wrong base URL. Make sure there's no trailing slash and no `/api/...` in the URL.
- `"401 Unauthorized"` → Bad token. Generate a new one in YouTrack.

---

## Running as a Background Service (Linux)

So the server keeps running after you close your terminal:

Create the file `/etc/systemd/system/pb-mcp.service`:

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

Replace `youruser` with your Linux username and `/path/to/pb-mcp` with the actual path.

Then run:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pb-mcp
sudo systemctl start pb-mcp
```

Check that it's running:
```bash
sudo systemctl status pb-mcp
```

See live logs:
```bash
sudo journalctl -u pb-mcp -f
```

---

## Troubleshooting

### "DATABASE_URL environment variable is not set"
Your `.env` file is missing or not in the right folder. It must be in the root `pb-mcp/` folder.

### "ADMIN_SECRET environment variable is not set"
Same as above — check your `.env` file exists and has `ADMIN_SECRET` set.

### Dashboard shows 404
You didn't build the dashboard. Go back to Step 6.

### Can't log into the dashboard
Your password is the value of `ADMIN_SECRET` in your `.env` file. It's the long random string, not the word "changeme".

### "permission denied for table products"
You forgot to run the GRANT commands in Step 5B. Go run them.

### "password authentication failed for user app_login"
The password in `DATABASE_URL` doesn't match what's set in PostgreSQL. Either:
- Fix the password in `.env` to match what you set in Step 5A, OR
- Re-run Step 5A with the password from your `.env`

### Can't access from external IP
See Step 8 — check firewall, reverse proxy, and cloud provider security groups.

### YouTrack sync returns 0 articles
Wrong project code. Check Step 12.

### YouTrack sync shows HTML/JSON parse error
Wrong base URL. Check Step 12 — no trailing slash, no `/api/...`.

### Server prints nothing and seems frozen
That's normal. The server prints everything to stderr, not stdout. Check `docker compose logs app` if using Docker, or `journalctl -u pb-mcp` if using systemd.

---

## Admin API Reference

All admin endpoints accept either:
- `Authorization: Bearer YOUR_JWT_TOKEN` (get a token by logging in), OR
- `X-Admin-Secret: YOUR_ADMIN_SECRET` (the raw secret from `.env`)

### Login
```bash
curl -s -X POST http://localhost:3000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "YOUR_ADMIN_SECRET"}'
```
Returns: `{ "token": "eyJ..." }` — use this token for all other requests.

### List tenants
```bash
curl -s http://localhost:3000/admin/tenants -H "Authorization: Bearer TOKEN"
```

### Get one tenant
```bash
curl -s http://localhost:3000/admin/tenants/TENANT_ID -H "Authorization: Bearer TOKEN"
```

### Create a new API key for a tenant
```bash
curl -s -X POST http://localhost:3000/admin/tenants/TENANT_ID/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"label": "Claude Desktop", "expiresAt": "2026-12-31T23:59:59Z"}'
```
`expiresAt` is optional — leave it out for a key that never expires.

### Revoke an API key
```bash
curl -s -X DELETE http://localhost:3000/admin/tenants/TENANT_ID/keys/KEY_ID \
  -H "Authorization: Bearer TOKEN"
```

### Manage tool permissions
```bash
# See current permissions
curl -s http://localhost:3000/admin/tenants/TENANT_ID/tools -H "Authorization: Bearer TOKEN"

# Enable/disable tools
curl -s -X PUT http://localhost:3000/admin/tenants/TENANT_ID/tools \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"tools": {"list_products": true, "create_invoice": false}}'
```

### Configure ERP connection
```bash
curl -s -X PUT http://localhost:3000/admin/tenants/TENANT_ID/erp-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"erpBaseUrl": "https://erp.example.com", "erpClientId": "...", "erpAppSecret": "...", "erpUsername": "...", "erpPassword": "...", "erpTerminal": "..."}'
```

### Test ERP connection
```bash
curl -s -X POST http://localhost:3000/admin/tenants/TENANT_ID/test-connection \
  -H "Authorization: Bearer TOKEN"
```

### View audit log
```bash
curl -s "http://localhost:3000/admin/tenants/TENANT_ID/audit-log?limit=25" \
  -H "Authorization: Bearer TOKEN"
```

### Trigger KB sync
```bash
curl -s -X POST http://localhost:3000/admin/kb/refresh -H "Authorization: Bearer TOKEN"
```

### Test YouTrack connection
```bash
curl -s -X POST http://localhost:3000/admin/kb/test-connection -H "Authorization: Bearer TOKEN"
```

### Interactive API docs
Open `http://localhost:3000/docs` in your browser — it has a clickable interface where you can try all endpoints.

### Dashboard
Open `http://localhost:3000/dashboard/` — it has a full GUI for everything above.
