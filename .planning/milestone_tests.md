# Milestone v2.1 — Manual Test Cases

**Created:** 2026-03-19
**Purpose:** Comprehensive manual verification checklist to run after all v2.1 phases complete.

---

## Phase 8: KB/Docs Management

### 8.1 YouTrack Configuration
- [ ] Knowledge Base page loads at `/dashboard/kb`
- [ ] "Knowledge Base" nav link appears in sidebar next to "Tenants"
- [ ] YouTrack config form has fields: Base URL, API Token, Project ID, Sync Interval
- [ ] Saving YT settings shows "Saved!" confirmation
- [ ] API Token field is masked (password type)
- [ ] Sync interval value persists after page reload

### 8.2 Sync Functionality
- [ ] Sync Status section shows last sync time and article count (or "Never synced" if fresh)
- [ ] "Sync Now" button shows inline spinner while syncing
- [ ] After sync: shows "Synced N articles" success message
- [ ] After failed sync: shows error message inline
- [ ] Sync status updates after successful sync (timestamp, article count)

### 8.3 Document Management
- [ ] Uploaded Documents section visible on KB page
- [ ] Can upload a new doc (title + content + optional tags)
- [ ] Uploaded doc appears in the list
- [ ] Can edit an uploaded doc (title, content, tags)
- [ ] Can delete an uploaded doc with confirmation
- [ ] Uploaded docs are searchable via MCP `search_kb` tool
- [ ] Pagination works when >25 docs exist

### 8.4 Tenant Detail Page Cleanup
- [ ] Tenant detail page has exactly 4 tabs: API Keys, Tool Permissions, ERP Config, Audit Log
- [ ] "API Docs" tab no longer appears on any tenant page
- [ ] Tool Permissions tab still works (per-tenant tool selection)

---

## Phase 9: Tenant Onboarding Flow

### 9.1 Credentials-First Flow
- [ ] Tenant creation form prompts for ERP credentials (base URL, client ID, app secret, username, password, terminal) before other fields
- [ ] Cannot proceed past credentials step without filling required fields

### 9.2 Connection Test Gate
- [ ] "Test Connection" button appears after entering ERP credentials
- [ ] Successful test shows clear pass result
- [ ] Failed test shows clear error message
- [ ] Cannot proceed to API key generation without successful test

### 9.3 API Key Generation
- [ ] API key is only generated after successful ERP connection test
- [ ] API key is displayed once and cannot be retrieved again
- [ ] Tenant appears in tenant list after creation completes

---

## Phase 10: Dashboard UX Polish

### 10.1 MCP Client Instructions
- [ ] Tenant detail page shows MCP client setup instructions
- [ ] Instructions include server URL and API key with copy buttons
- [ ] Copy buttons work correctly

### 10.2 Multi-Client Setup Snippets
- [ ] Claude Desktop config snippet shown (claude_desktop_config.json format)
- [ ] Cursor config snippet shown
- [ ] Generic MCP client JSON example shown

### 10.3 PDF Export
- [ ] "Export PDF" button visible on tenant detail page
- [ ] PDF contains tenant name
- [ ] PDF contains MCP URL
- [ ] PDF contains masked API key
- [ ] PDF contains usage instructions for all 3 MCP clients
- [ ] PDF downloads successfully

### 10.4 Tooltips
- [ ] "API Key" has tooltip explaining what it is
- [ ] "Slug" has tooltip explaining what it is
- [ ] "Tool Permissions" has tooltip
- [ ] "ERP Config" has tooltip
- [ ] "RLS" or other technical terms have tooltips where they appear
- [ ] Tooltips appear on hover and are readable

---

## Phase 11: Setup Documentation

### 11.1 README
- [ ] README has clear project overview
- [ ] README has quickstart section (clone to running server)
- [ ] README links to detailed setup guides

### 11.2 Linux/VPS Guide
- [ ] Guide covers Node.js 22 installation on Ubuntu/Debian
- [ ] Guide covers PostgreSQL setup (user, database, roles)
- [ ] Guide covers environment variable configuration
- [ ] Guide covers database migrations
- [ ] Guide covers starting the server
- [ ] Guide covers dashboard build for production

### 11.3 Docker Guide
- [ ] Dockerfile provided and annotated
- [ ] docker-compose.yml includes server + PostgreSQL
- [ ] Guide covers building and running containers
- [ ] Guide covers environment variable configuration
- [ ] Guide covers persistent data (volumes)

### 11.4 Windows Server Guide
- [ ] Guide covers Node.js 22 installation on Windows
- [ ] Guide covers PostgreSQL setup on Windows
- [ ] Guide covers environment variable configuration
- [ ] Guide covers running as a service (optional)
- [ ] Guide covers dashboard build for production

---

*Run all tests after v2.1 milestone completion.*
*Last updated: 2026-03-19 — Phase 8 test cases added*
