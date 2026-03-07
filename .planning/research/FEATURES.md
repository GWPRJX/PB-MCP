# Feature Landscape: Multi-Tenant ERP MCP Server

**Domain:** Multi-tenant ERP exposed via Model Context Protocol for small businesses
**Researched:** 2026-03-07
**Overall confidence:** MEDIUM-HIGH (MCP tool patterns HIGH from official docs; ERP features MEDIUM from market research; YouTrack KB sync HIGH from official JetBrains API docs)

---

## How to Read This Document

Features are categorized across five dimensions:

1. **MCP Tool Surface** — what tools the AI uses to talk to ERP data
2. **Inventory & Products** — stock, catalog, warehouse
3. **Orders & Billing** — order lifecycle, invoices, payments
4. **CRM / Contacts** — customers, leads, deal pipeline
5. **Tenant Management** — admin API/UI for provisioning
6. **YouTrack KB Sync** — doc pull, refresh, search, self-config

Each section has: Table Stakes, Differentiators, and Anti-Features.

---

## MCP Tool Surface Design

### Table Stakes

These apply across all modules. Without them the MCP server fails as an AI integration layer.

| Feature | Why Expected | Complexity | MCP Tool Names / Notes |
|---------|--------------|------------|------------------------|
| Verb-prefixed tool naming | AI models parse tool names to select correct tool; inconsistent names cause wrong-tool selection | Low | `get_*`, `list_*`, `create_*`, `update_*`, `delete_*`, `search_*` — use snake_case consistently |
| Per-tenant auth on every tool call | Every tool must scope to the calling tenant — no cross-tenant bleed | Medium | API key passed as header or MCP session credential; resolved to tenant context server-side |
| Rich tool descriptions | LLMs read descriptions to decide which tool to call — vague descriptions cause hallucinated tool usage | Low | Each tool description must state: what it does, when to use it vs alternatives, required vs optional params |
| Flat input schemas | Path + query + body params collapsed into a single flat object per tool | Low | No nested HTTP conventions in tool I/O — reshape API responses before returning to MCP client |
| Structured errors with context | AI needs parseable errors to retry intelligently | Low | Return `{ error: { code, message, field? } }` not raw HTTP status codes |
| Pagination on all list tools | Unbounded list results overflow context window | Medium | `list_*` tools accept `limit` (max 50 default) and `cursor` or `offset`; return `total_count` |
| Read-only vs write tool separation | AI should be able to browse safely without risk of mutation | Low | Never mix read and write in one tool; separate them explicitly |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Semantic tool discovery | When tool count grows, a `search_tools` meta-tool lets AI find relevant tools without reading all schemas | High | Reduces context window pressure; critical if tool count exceeds ~30 |
| Workflow-bundled tools | High-frequency multi-step operations (place order + deduct stock + create invoice) as single atomic tools | Medium | `create_order_with_invoice` avoids 3-round-trip agent loops; name by user intent not CRUD verb |
| Tool-level usage hints | Guidance on which tool to prefer for natural language queries | Low | Add `"prefer_for": ["low stock check", "reorder query"]` style hints in description |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Exposing all tools for all modules upfront | Context window bloat; 30+ tools consume 10%+ of usable tokens before user says anything | Expose tools per-module; use progressive discovery or semantic search meta-tool |
| Raw API mirroring (1 REST endpoint = 1 tool) | HTTP conventions (status codes, headers, nested pagination objects) are hostile to LLMs | Reshape all tool I/O to be flat, agent-friendly, and self-describing |
| Overly broad tool parameters | `filters: object` is unusable by AI; too ambiguous | Explicit named parameters: `status`, `customer_id`, `date_from`, `date_to` |

---

## Module 1: Inventory & Products

### Table Stakes

| Feature | Why Expected | Complexity | MCP Tool Names |
|---------|--------------|------------|----------------|
| Product catalog — get by ID | Foundation of every inventory query | Low | `get_product` (id) |
| Product catalog — list/search | Browse catalog, find by name/SKU/category | Low | `list_products` (category, search_query, limit, cursor) |
| Real-time stock levels | Core SMB question: "do we have this in stock?" | Low | `get_stock_level` (product_id, location_id?) |
| Low-stock alerts query | "What's running low?" is the most common inventory question | Low | `list_low_stock_products` (threshold?) — returns products below reorder point |
| Stock adjustment (write) | Receive goods, write-offs, corrections | Medium | `adjust_stock` (product_id, quantity_delta, reason, location_id?) |
| Product create/update | Onboard new products, update pricing | Medium | `create_product`, `update_product` |
| Reorder point configuration | Threshold below which stock is flagged as low | Low | Stored per product; editable via `update_product` |
| Location/warehouse context | Multi-location tracking even for 1 warehouse | Low | Optional `location_id` on stock queries; defaults to primary location |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Product variants | Sizes, colors, etc. tracked as child SKUs under a parent product | High | Critical for retail SMBs; complex data model — defer unless explicitly needed |
| Batch / lot tracking | Essential for food, pharma, compliance SMBs | High | Serial numbers or lot codes per stock unit |
| Stock valuation query | "What is my inventory worth?" — useful for financial reporting | Medium | `get_inventory_valuation` — COGS or average cost method |
| AI-suggested reorder quantities | Based on historical order velocity + current stock | High | Requires analytics layer; phase 2+ |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Warehouse management (pick/pack/put-away) | WMS complexity far exceeds SMB needs; dedicated WMS tools exist | Simple quantity-in/quantity-out per location |
| Manufacturing BOM / production orders | Full MRP is a separate product category | Out of scope per PROJECT.md |
| Full e-commerce catalog sync | Bi-directional Shopify/WooCommerce sync is a product integration project | Expose webhook endpoint stub for future |

### Natural Language Queries This Enables

- "How many units of SKU-1234 do we have?"
- "What products are running low on stock?"
- "We received 50 units of the blue widget — update inventory."
- "What's our most expensive item in the electronics category?"

---

## Module 2: Orders & Billing

### Table Stakes

| Feature | Why Expected | Complexity | MCP Tool Names |
|---------|--------------|------------|----------------|
| Get order by ID | Look up a specific order | Low | `get_order` (order_id) |
| List orders with filters | Find orders by status, customer, date range | Low | `list_orders` (status, customer_id, date_from, date_to, limit, cursor) |
| Order status lifecycle | pending → confirmed → shipped → delivered → cancelled | Low | Status field on order; `update_order_status` tool |
| Create order | Core write operation for sales flow | Medium | `create_order` (customer_id, line_items[], notes?) |
| Line item management | Products + quantities + prices on an order | Medium | Part of `create_order`; `add_order_line_item`, `remove_order_line_item` |
| Invoice generation | Core billing action — create invoice from order | Medium | `create_invoice` (order_id) or `create_invoice` (customer_id, line_items[]) |
| Get invoice by ID | Look up invoice status and details | Low | `get_invoice` (invoice_id) |
| List invoices with filters | Find unpaid invoices, overdue, by customer | Low | `list_invoices` (status, customer_id, overdue_only?, limit, cursor) |
| Mark invoice paid | Record payment receipt | Low | `mark_invoice_paid` (invoice_id, payment_date, payment_method?) |
| Invoice totals — tax + discounts | Tax calc and discounts are expected even in SMB | Medium | Stored on invoice; tax rate per tenant config |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Overdue invoice summary | "Which customers owe us money?" is a top-10 SMB question | Low | `list_overdue_invoices` (days_overdue_min?) — high value, low effort |
| Automatic inventory deduction on order confirm | Orders confirmed = stock deducted without manual step | Medium | Workflow tool: `confirm_order` triggers stock deduction atomically |
| Payment reminders query | "Who hasn't paid after 30 days?" | Low | Filter on `list_invoices` with `overdue_only: true`, `days_overdue_min: 30` |
| Order search by product | "Which orders contain SKU-1234?" | Medium | Cross-join query; `search_orders_by_product` (product_id) |
| Revenue summary | "How much did we bill this month?" | Medium | `get_revenue_summary` (period: month/quarter/year) |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Payment gateway integration (Stripe, PayPal) | Full payment processing is a compliance and infrastructure project | Record payment via `mark_invoice_paid`; payment processor is external |
| Recurring billing / subscriptions | Subscription billing is a product category unto itself | Out of scope for v1; flag as future |
| Multi-currency | Currency conversion complexity outweighs SMB need in v1 | Single currency per tenant; currency code stored in tenant config |
| PDF invoice generation | PDF rendering adds dependencies; AI doesn't need PDFs | Return structured invoice data; let client render if needed |

### Natural Language Queries This Enables

- "Show me all open orders for Acme Corp."
- "Create an invoice for the order we placed yesterday."
- "Which invoices are more than 30 days overdue?"
- "How much revenue did we generate last month?"
- "Mark invoice #1042 as paid — we received a bank transfer today."

---

## Module 3: CRM / Contacts

### Table Stakes

| Feature | Why Expected | Complexity | MCP Tool Names |
|---------|--------------|------------|----------------|
| Get contact by ID | Look up a specific person or company | Low | `get_contact` (contact_id) |
| List / search contacts | Find by name, company, email, tag | Low | `list_contacts` (search_query, company_id, tag, limit, cursor) |
| Create contact | Add new customer, lead, or supplier | Low | `create_contact` (name, email, phone?, company?, type?) |
| Update contact | Correct info, add notes | Low | `update_contact` (contact_id, fields...) |
| Company / account records | B2B: track organizations with multiple contacts | Medium | `get_company`, `list_companies`, `create_company` |
| Contact-to-company linking | Associate individuals with their employer | Low | `contact_id` + `company_id` link stored on contact |
| Notes / interaction log | Log calls, meetings, email summaries | Medium | `add_contact_note` (contact_id, content, note_type?) |
| Contact tags / segments | Group contacts (VIP, lead, supplier, churned) | Low | Tags stored as string array; filterable on `list_contacts` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Deal / opportunity pipeline | Track active sales opportunities with stage and value | High | `create_deal`, `update_deal_stage`, `list_deals` (stage, contact_id) |
| Contact order history | "What has this customer bought before?" — links CRM to orders | Medium | `list_contact_orders` (contact_id) — cross-module join |
| Contact outstanding balance | "Does this customer owe us anything?" — links CRM to billing | Medium | `get_contact_balance` (contact_id) — sum of unpaid invoices |
| Last interaction date | AI can surface contacts who haven't been contacted in 30+ days | Low | Stored field on contact; filterable |
| Bulk contact search | Find all contacts in a region, industry, or value tier | Medium | `search_contacts` with multi-field filter; separate from `list_contacts` |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Email marketing automation | Requires ESP integration, compliance (CAN-SPAM/GDPR), unsubscribe flows | Out of scope; log emails as notes |
| Full sales forecasting / analytics | Revenue forecasting requires historical data and ML | Return raw deal pipeline data; let AI analyze |
| Contact deduplication engine | Fuzzy matching across a contact list is complex and error-prone | Flag duplicates via simple email uniqueness check; manual merge |
| Social media profile sync | LinkedIn/Twitter integration adds OAuth complexity with low SMB value | Out of scope for v1 |

### Natural Language Queries This Enables

- "Find all contacts at Acme Corp."
- "Add a note to Sarah Johnson's profile — she called about a refund."
- "Which customers haven't placed an order in 6 months?"
- "Show me all deals in the 'proposal sent' stage."
- "What has this customer ordered before and what do they owe us?"

---

## Module 4: Tenant Management (Admin API/UI)

This module is primarily for the platform operator (developer/admin), not the end-user AI. The AI doesn't call these tools — they are REST API + admin UI endpoints.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create tenant | Provision a new organization with isolated data | Medium | POST /admin/tenants — triggers schema/RLS setup; returns tenant_id |
| Deactivate/suspend tenant | Stop access without deleting data | Low | PATCH /admin/tenants/{id} with status: suspended |
| List tenants | See all provisioned organizations | Low | GET /admin/tenants with pagination |
| Get tenant details | View config, status, usage | Low | GET /admin/tenants/{id} |
| Issue API key per tenant | Each tenant's AI clients authenticate with a unique key | Low | POST /admin/tenants/{id}/api-keys — returns key (shown once) |
| Revoke API key | Disable compromised or unused credentials | Low | DELETE /admin/tenants/{id}/api-keys/{key_id} |
| Tenant config (currency, timezone, name) | Per-tenant business settings | Low | PATCH /admin/tenants/{id}/config |
| Developer onboarding in <10 min | Clone → add tenant → running MCP server fast | Medium | README + seed script + single CLI command to provision first tenant |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| API key rotation | Generate new key without downtime; old key has grace period | Medium | POST /admin/tenants/{id}/api-keys/rotate — returns new key, invalidates old after TTL |
| Tenant usage metrics | See which tenants are active, how many tool calls/day | High | Audit log aggregation; useful for billing and abuse detection |
| Audit log per tenant | Immutable record of all writes (who, what, when) | Medium | Append-only log table; `list_audit_log` (tenant_id, date_range) |
| Admin UI (web) | Visual tenant management without REST calls | High | Optional for v1; CLI or Postman collection may be sufficient |
| Tenant data export | GDPR right-to-portability; tenant offboarding | Medium | JSON dump of all tenant data via admin API |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Self-service tenant signup | B2C SaaS flow adds auth, billing, email verification complexity | Admin creates tenants manually or via API; no public signup |
| RBAC / user roles per tenant | Role management within a tenant is a product in itself | Single API key = full access; role scoping is phase 2+ |
| SSO / SAML for tenant users | Enterprise auth complexity exceeds SMB v1 scope | API key auth; revisit for enterprise tier |
| Multi-region tenant routing | Data residency adds infra and compliance complexity | Single region for v1 |

---

## Module 5: YouTrack KB Sync

This module gives AI clients the ability to query live API documentation stored in YouTrack knowledge base articles. It also enables the server to self-configure tool definitions from KB content.

### What YouTrack Provides (MEDIUM-HIGH confidence)

YouTrack exposes a REST API for knowledge base articles at `/api/articles`. Supported operations:
- `GET /api/articles` — paginated article list with `$top` / `$skip`
- `GET /api/articles/{articleID}` — single article with fields: `id`, `summary`, `content`, `created`, `updated`, `project`, `childArticles`, `tags`
- Articles support hierarchical structure (parent/child), tags, and full-text content

YouTrack 2025.3 introduced its own MCP server for YouTrack data, but this project syncs KB content into local storage rather than routing AI calls to YouTrack's MCP at runtime.

### Table Stakes

| Feature | Why Expected | Complexity | MCP Tool Names / API Notes |
|---------|--------------|------------|---------------------------|
| Pull all KB articles from YouTrack | Foundation — populate local cache from YouTrack REST API | Medium | Internal job: `sync_kb_articles` (project_id); not exposed as MCP tool |
| Store article content locally | AI queries should not hit YouTrack on every request — latency and rate limits | Medium | Local DB table: `kb_articles (id, summary, content, updated_at, tags)` |
| On-demand refresh | Re-pull articles when KB changes; both pull-on-demand and periodic | Low | `refresh_kb` MCP tool (admin-only) + scheduled cron job |
| Detect stale articles | Know when a local article is out of date | Low | Compare `updated` field from YouTrack with local `synced_at` |
| Search KB by keyword | "How does the invoice API work?" — full-text search over synced articles | Medium | `search_kb` (query) → returns matching article summaries + content excerpts |
| Get KB article by ID | Retrieve full article content | Low | `get_kb_article` (article_id) |
| List KB articles | Browse all synced KB content | Low | `list_kb_articles` (tag?, project?) |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tag-based article filtering | Separate "internal ERP APIs" from "third-party integration docs" | Low | YouTrack tags map to local article tags; filterable on `search_kb` |
| Article version tracking | Know when content changed; optionally store deltas | High | Store `content_hash` per sync; flag if changed — full version history is overkill for v1 |
| Self-configuration from KB | Server reads KB articles to configure tool descriptions dynamically | Very High | Tool definition stored in YouTrack article; server hot-reloads on KB refresh — extremely powerful but complex; phase 2+ |
| Semantic KB search | Vector similarity search for "what does X do?" vs keyword match | High | Requires embedding model + vector store; significantly better recall than keyword |
| Sync status MCP tool | "When was the KB last synced? Are there new articles?" | Low | `get_kb_sync_status` → last_synced_at, article_count, stale_count |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Two-way sync (write back to YouTrack) | This is a read-only KB mirror; writing to YouTrack is out of scope | One-way pull only |
| Real-time YouTrack webhooks | Webhook registration complexity vs value in v1 | Polling on schedule (e.g., every 15 min) + manual `refresh_kb` trigger |
| Storing YouTrack attachments (PDFs, images) | Binary files add storage complexity; AI can't use them well | Text content only; ignore attachments |
| Full YouTrack issue tracker integration | Issues ≠ KB articles; issue tracking is a separate concern | KB articles only; issues out of scope |

### Natural Language Queries This Enables

- "How does the invoice API work?"
- "What third-party integrations are documented?"
- "Show me all articles tagged 'payment-gateway'."
- "When were the API docs last updated?"
- "What endpoints does the inventory module expose?"

---

## Cross-Module Feature Dependencies

```
Tenant created (admin API)
  └── API key issued
        └── MCP session authenticated
              ├── Inventory tools available
              ├── Order tools available (requires inventory: product lookup)
              ├── CRM tools available
              └── KB search tools available

Contact created (CRM)
  └── Order created (references contact_id)
        └── Invoice created (references order_id)
              └── Invoice paid (closes order billing cycle)

YouTrack KB synced
  └── search_kb available to AI
        └── (future) tool definitions hot-reloaded from KB articles
```

---

## MVP Recommendation

### Must ship in v1 (table stakes without which the product has no value)

1. **Tenant provisioning** — create tenant, issue API key, data isolated
2. **Inventory read tools** — `get_product`, `list_products`, `get_stock_level`, `list_low_stock_products`
3. **Inventory write tools** — `create_product`, `adjust_stock`
4. **Order read tools** — `get_order`, `list_orders`
5. **Order write tools** — `create_order`, `update_order_status`
6. **Billing tools** — `create_invoice`, `get_invoice`, `list_invoices`, `mark_invoice_paid`
7. **CRM read tools** — `get_contact`, `list_contacts`, `search_contacts`
8. **CRM write tools** — `create_contact`, `update_contact`, `add_contact_note`
9. **KB sync** — pull articles, `search_kb`, `get_kb_article`, `refresh_kb`

### Defer to v2

- Deal pipeline (CRM)
- Semantic KB search (vector embeddings)
- Self-configuration from KB (tool definitions from articles)
- Audit log UI
- Admin web UI (ship REST API first)
- Product variants
- Revenue summary / analytics tools

---

## Feature Complexity Summary

| Feature Area | Table Stakes Count | Complexity | Biggest Risk |
|--------------|-------------------|------------|-------------|
| MCP tool surface design | 7 patterns | Low-Medium | Tool naming inconsistency causing LLM confusion |
| Inventory & Products | 8 tools | Low-Medium | Stock sync if orders auto-deduct |
| Orders & Billing | 10 tools | Medium | Invoice-order link, tax calculation |
| CRM / Contacts | 8 tools | Low-Medium | Company-contact relationship model |
| Tenant Management | 8 endpoints | Medium | API key security, schema isolation on provision |
| YouTrack KB Sync | 7 features | Medium | Article content parsing, refresh scheduling |

---

## Sources

- [MCP Tool Design Patterns — mapping APIs to tools](https://www.scalekit.com/blog/map-api-into-mcp-tool-definitions)
- [Less is More: MCP Design Patterns for AI Agents](https://www.klavis.ai/blog/less-is-more-mcp-design-patterns-for-ai-agents)
- [MCP Tool Overload and Context Window Issues](https://www.lunar.dev/post/why-is-there-mcp-tool-overload-and-how-to-solve-it-for-your-ai-agents)
- [MCP Tool Bloat — 10 strategies](https://thenewstack.io/how-to-reduce-mcp-token-bloat/)
- [YouTrack Articles REST API](https://www.jetbrains.com/help/youtrack/devportal/resource-api-articles.html)
- [YouTrack REST API Reference](https://www.jetbrains.com/help/youtrack/devportal/youtrack-rest-api.html)
- [YouTrack 2026 Roadmap (MCP support confirmed)](https://blog.jetbrains.com/youtrack/2026/03/youtrack-2026-roadmap/)
- [Small Business ERP Features — NetSuite](https://www.netsuite.com/portal/resource/articles/erp/smb-erp.shtml)
- [ERP Inventory Management Features — Shopify](https://www.shopify.com/enterprise/blog/erp-inventory-management)
- [SMB CRM Must-Have Features 2025](https://keap.com/small-business-automation-blog/business-management/top-crm-software-features-every-small-business-needs-2025)
- [Multi-Tenant SaaS Architecture 2025](https://isitdev.com/multi-tenant-saas-architecture-cloud-2025/)
- [AI in ERP — Natural Language Queries](https://www.top10erp.org/blog/ai-in-erp)
- [MCP Server Naming Conventions](https://zazencodes.com/blog/mcp-server-naming-conventions)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
