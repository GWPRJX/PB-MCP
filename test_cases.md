# PB MCP v2 — Test Cases

**Server:** `http://localhost:3000`
**Total Test Cases:** 62

---

## Prerequisites

Set these before running:
```
SERVER=http://localhost:3000
ADMIN_SECRET=<your admin secret>
TENANT_ID=<tenant UUID>
API_KEY=<tenant API key>
```

---

## 1. Admin Auth (4 tests)

### TC-1.1: Login with valid credentials
```bash
curl -s -X POST $SERVER/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"'$ADMIN_SECRET'"}'
```
**Expected:** 200 — `{ "token": "<JWT>" }`
**Save:** `JWT=<token from response>`

### TC-1.2: Login with wrong password
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'
```
**Expected:** 401 — `{ "error": "Invalid credentials" }`

### TC-1.3: Admin request with JWT
```bash
curl -s $SERVER/admin/tenants \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Array of tenants

### TC-1.4: Admin request with X-Admin-Secret
```bash
curl -s $SERVER/admin/tenants \
  -H "X-Admin-Secret: $ADMIN_SECRET"
```
**Expected:** 200 — Same array of tenants

---

## 2. Tenant Management (5 tests)

### TC-2.1: List tenants
```bash
curl -s $SERVER/admin/tenants \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Array with tenant objects (id, name, slug, plan, status, keyCount, createdAt)

### TC-2.2: Get single tenant
```bash
curl -s $SERVER/admin/tenants/$TENANT_ID \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Tenant object with `apiKeys` array

### TC-2.3: Get non-existent tenant
```bash
curl -s -w "\n%{http_code}" $SERVER/admin/tenants/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 404 — `{ "error": "Tenant not found" }`

### TC-2.4: Create tenant
```bash
curl -s -X POST $SERVER/admin/tenants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Tenant","slug":"test-tc","plan":"standard"}'
```
**Expected:** 201 — `{ "tenantId": "<UUID>", "apiKey": "pb_..." }`
**Save:** `TEST_TENANT_ID=<tenantId>`, `TEST_API_KEY=<apiKey>`

### TC-2.5: Create duplicate slug
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/admin/tenants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Duplicate","slug":"test-tc","plan":"standard"}'
```
**Expected:** 409 — Slug already exists error

---

## 3. API Key Management (4 tests)

### TC-3.1: Create API key with label
```bash
curl -s -X POST $SERVER/admin/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"label":"test-key"}'
```
**Expected:** 201 — `{ "keyId": "<UUID>", "apiKey": "pb_..." }`
**Save:** `NEW_KEY_ID=<keyId>`, `NEW_API_KEY=<apiKey>`

### TC-3.2: Create API key with expiry
```bash
curl -s -X POST $SERVER/admin/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"label":"expiring-key","expiresAt":"2020-01-01T00:00:00Z"}'
```
**Expected:** 201 — Key created (already expired)
**Save:** `EXPIRED_KEY=<apiKey>`

### TC-3.3: Revoke API key
```bash
curl -s -w "\n%{http_code}" -X DELETE $SERVER/admin/tenants/$TENANT_ID/keys/$NEW_KEY_ID \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 204 — Empty body

### TC-3.4: Revoke already-revoked key
```bash
curl -s -w "\n%{http_code}" -X DELETE $SERVER/admin/tenants/$TENANT_ID/keys/$NEW_KEY_ID \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 404 — Key not found or already revoked

---

## 4. MCP Auth (5 tests)

### TC-4.1: MCP request with valid API key
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 200 — `{ "jsonrpc": "2.0", "result": { "tools": [...] }, "id": 1 }`

### TC-4.2: MCP request without API key
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 401 — `Missing X-Api-Key header`

### TC-4.3: MCP request with invalid API key
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/mcp \
  -H "X-Api-Key: pb_invalidkeyhere" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 401 — `Invalid or revoked API key`

### TC-4.4: MCP request with revoked API key
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/mcp \
  -H "X-Api-Key: $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 401 — `Invalid or revoked API key`

### TC-4.5: MCP request with expired API key
```bash
curl -s -w "\n%{http_code}" -X POST $SERVER/mcp \
  -H "X-Api-Key: $EXPIRED_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 401 — `API key expired`

---

## 5. Tool Access Control (4 tests)

### TC-5.1: Get tool permissions (27 tools)
```bash
curl -s $SERVER/admin/tenants/$TENANT_ID/tools \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Array of 27 `{ toolName, enabled }` objects, all enabled by default

### TC-5.2: Disable a tool
```bash
curl -s -X PUT $SERVER/admin/tenants/$TENANT_ID/tools \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"permissions":[{"toolName":"create_invoice","enabled":false}]}'
```
**Expected:** 200 — Updated permissions array with `create_invoice` disabled

### TC-5.3: Verify disabled tool not in MCP tools/list
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```
**Expected:** 200 — tools array does NOT contain `create_invoice`

### TC-5.4: Re-enable the tool
```bash
curl -s -X PUT $SERVER/admin/tenants/$TENANT_ID/tools \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"permissions":[{"toolName":"create_invoice","enabled":true}]}'
```
**Expected:** 200 — `create_invoice` back to enabled

---

## 6. ERP Configuration (2 tests)

### TC-6.1: Update ERP config
```bash
curl -s -X PUT $SERVER/admin/tenants/$TENANT_ID/erp-config \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "erpBaseUrl":"https://posibolt.example.com",
    "erpClientId":"client_id",
    "erpAppSecret":"secret",
    "erpUsername":"user",
    "erpPassword":"pass",
    "erpTerminal":"TERM1"
  }'
```
**Expected:** 200 — `{ "updated": true }`

### TC-6.2: Test ERP connection
```bash
curl -s -X POST $SERVER/admin/tenants/$TENANT_ID/test-connection \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — `{ "connected": true|false, "message": "..." }`

---

## 7. Inventory Tools (7 tests)

### TC-7.1: list_products
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"list_products","arguments":{"limit":5}}}'
```
**Expected:** 200 — Result with `items` array (up to 5 products), `count`, `next_cursor`

### TC-7.2: get_product
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"get_product","arguments":{"searchText":"test"}}}'
```
**Expected:** 200 — Product details or NOT_FOUND error

### TC-7.3: list_stock_levels
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"list_stock_levels","arguments":{}}}'
```
**Expected:** 200 — Result with warehouse stock data

### TC-7.4: get_stock_level
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":5,"params":{"name":"get_stock_level","arguments":{"searchText":"test"}}}'
```
**Expected:** 200 — Stock level for matching product

### TC-7.5: list_low_stock
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":6,"params":{"name":"list_low_stock","arguments":{"threshold":10,"limit":5}}}'
```
**Expected:** 200 — Products below threshold

### TC-7.6: list_suppliers
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":7,"params":{"name":"list_suppliers","arguments":{}}}'
```
**Expected:** 200 — Guidance message suggesting `search_contacts` instead

### TC-7.7: get_supplier
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":8,"params":{"name":"get_supplier","arguments":{"vendorId":1020067}}}'
```
**Expected:** 200 — Vendor details from POSibolt

---

## 8. Orders & Billing Tools (6 tests)

### TC-8.1: list_orders
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":10,"params":{"name":"list_orders","arguments":{"limit":5}}}'
```
**Expected:** 200 — Recent sales orders with line items

### TC-8.2: get_order
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":11,"params":{"name":"get_order","arguments":{"orderNo":"ORDER_NUMBER_HERE"}}}'
```
**Expected:** 200 — Full order details with lines and payments

### TC-8.3: list_invoices
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":12,"params":{"name":"list_invoices","arguments":{"limit":5}}}'
```
**Expected:** 200 — Recent invoices

### TC-8.4: get_invoice
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":13,"params":{"name":"get_invoice","arguments":{"invoiceNo":"INVOICE_NUMBER_HERE"}}}'
```
**Expected:** 200 — Full invoice details

### TC-8.5: list_overdue_invoices
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":14,"params":{"name":"list_overdue_invoices","arguments":{"customerId":CUSTOMER_ID_HERE}}}'
```
**Expected:** 200 — Open invoices for customer

### TC-8.6: get_payment_summary
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":15,"params":{"name":"get_payment_summary","arguments":{}}}'
```
**Expected:** 200 — Aggregate payment totals

---

## 9. CRM Tools (5 tests)

### TC-9.1: list_contacts
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":20,"params":{"name":"list_contacts","arguments":{"limit":5}}}'
```
**Expected:** 200 — Business partners with contact details

### TC-9.2: get_contact
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":21,"params":{"name":"get_contact","arguments":{"customerId":CUSTOMER_ID_HERE}}}'
```
**Expected:** 200 — Single contact details

### TC-9.3: search_contacts
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":22,"params":{"name":"search_contacts","arguments":{"query":"test","limit":5}}}'
```
**Expected:** 200 — Matching contacts

### TC-9.4: get_contact_orders
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":23,"params":{"name":"get_contact_orders","arguments":{"customerId":CUSTOMER_ID_HERE}}}'
```
**Expected:** 200 — Pending orders for customer

### TC-9.5: get_contact_invoices
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":24,"params":{"name":"get_contact_invoices","arguments":{"customerId":CUSTOMER_ID_HERE}}}'
```
**Expected:** 200 — Open invoices and balance

---

## 10. KB Tools (3 tests)

### TC-10.1: search_kb
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":30,"params":{"name":"search_kb","arguments":{"query":"API","limit":5}}}'
```
**Expected:** 200 — Matching KB articles

### TC-10.2: get_kb_article
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":31,"params":{"name":"get_kb_article","arguments":{"article_id":"P8-A-7"}}}'
```
**Expected:** 200 — Full article content

### TC-10.3: get_kb_sync_status
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":32,"params":{"name":"get_kb_sync_status","arguments":{}}}'
```
**Expected:** 200 — `last_synced_at` and `article_count`

---

## 11. Write Tools (6 tests)

### TC-11.1: create_stock_entry
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":40,"params":{"name":"create_stock_entry","arguments":{
    "fromWarehouseId":FROM_WAREHOUSE_ID,
    "toWarehouseId":TO_WAREHOUSE_ID,
    "lines":[{"productId":PRODUCT_ID,"qty":1,"uom":"Each"}]
  }}}'
```
**Expected:** 200 — Stock transfer request created in POSibolt

### TC-11.2: update_stock_entry
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":41,"params":{"name":"update_stock_entry","arguments":{
    "toWarehouseId":TO_WAREHOUSE_ID,
    "stockTransferId":0,
    "comments":"test transfer",
    "issuedBy":"admin",
    "lines":[{"productId":PRODUCT_ID,"qty":1,"uom":"Each","uomId":100}]
  }}}'
```
**Expected:** 200 — Stock transfer completed

### TC-11.3: create_invoice
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":42,"params":{"name":"create_invoice","arguments":{
    "customerId":CUSTOMER_ID,
    "invoiceNo":"TEST-INV-001",
    "priceListId":PRICE_LIST_ID,
    "warehouseId":WAREHOUSE_ID,
    "paymentType":"Credit",
    "grandTotal":100,
    "lines":[{"productId":PRODUCT_ID,"qty":1,"unitPrice":100,"uom":"Each"}]
  }}}'
```
**Expected:** 200 — Sales invoice created in POSibolt

### TC-11.4: update_invoice (cancel order)
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":43,"params":{"name":"update_invoice","arguments":{
    "orderNo":"ORDER_NO_TO_CANCEL"
  }}}'
```
**Expected:** 200 — Order cancelled in POSibolt

### TC-11.5: create_contact
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":44,"params":{"name":"create_contact","arguments":{
    "customerCode":"TEST-001",
    "name":"Test Customer",
    "region":"Test Region",
    "address1":"123 Test St",
    "active":true,
    "city":"Test City",
    "country":"India",
    "email":"test@example.com"
  }}}'
```
**Expected:** 200 — `{ "responseCode": 200, "message": "Success", "recordNo": ... }`

### TC-11.6: update_contact
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":45,"params":{"name":"update_contact","arguments":{
    "customerId":CUSTOMER_ID,
    "name":"Updated Name",
    "email":"updated@example.com"
  }}}'
```
**Expected:** 200 — `{ "responseCode": 200, "message": "Success", ... }`

---

## 12. KB Doc Management (5 tests)

### TC-12.1: Upload doc
```bash
curl -s -X POST $SERVER/admin/kb/upload \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Doc","content":"# Test\n\nThis is a test document.","tags":["test"]}'
```
**Expected:** 201 — Doc created with `DOC-*` youtrackId

### TC-12.2: List docs
```bash
curl -s $SERVER/admin/kb/docs \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — `{ "docs": [...], "totalCount": N }`

### TC-12.3: Get single doc
```bash
curl -s $SERVER/admin/kb/docs/$DOC_ID \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Full doc with content

### TC-12.4: Update doc
```bash
curl -s -X PUT $SERVER/admin/kb/docs/$DOC_ID \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Test Doc","content":"# Updated\n\nUpdated content."}'
```
**Expected:** 200 — `{ "updated": true }`

### TC-12.5: Delete doc
```bash
curl -s -w "\n%{http_code}" -X DELETE $SERVER/admin/kb/docs/$DOC_ID \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 204

---

## 13. Audit Log (3 tests)

### TC-13.1: Query audit log (unfiltered)
```bash
curl -s "$SERVER/admin/tenants/$TENANT_ID/audit-log?limit=10" \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — `{ "entries": [...], "totalCount": N }` — entries from prior tool calls

### TC-13.2: Query audit log filtered by tool
```bash
curl -s "$SERVER/admin/tenants/$TENANT_ID/audit-log?toolName=list_products&limit=5" \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Only `list_products` entries

### TC-13.3: Query audit log filtered by status
```bash
curl -s "$SERVER/admin/tenants/$TENANT_ID/audit-log?status=success&limit=5" \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Only successful entries

---

## 14. List All Tools (1 test)

### TC-14.1: Get all registered tool names
```bash
curl -s $SERVER/admin/tools \
  -H "Authorization: Bearer $JWT"
```
**Expected:** 200 — Array of 27 tool name strings

---

## 15. Edge Cases (2 tests)

### TC-15.1: MCP tools/list shows 27 tools (no filter)
```bash
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":99,"params":{}}' | python -c "import sys,json; print(len(json.load(sys.stdin)['result']['tools']))"
```
**Expected:** `27`

### TC-15.2: Call disabled tool returns error
```bash
# First disable list_products
curl -s -X PUT $SERVER/admin/tenants/$TENANT_ID/tools \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"permissions":[{"toolName":"list_products","enabled":false}]}'

# Then try to call it
curl -s -X POST $SERVER/mcp \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":100,"params":{"name":"list_products","arguments":{}}}'

# Re-enable it
curl -s -X PUT $SERVER/admin/tenants/$TENANT_ID/tools \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"permissions":[{"toolName":"list_products","enabled":true}]}'
```
**Expected:** Tool call returns MCP error (unknown tool / method not found)

---

## Test Results Tracker

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.1 | Login valid | | |
| 1.2 | Login invalid | | |
| 1.3 | JWT auth | | |
| 1.4 | Secret auth | | |
| 2.1 | List tenants | | |
| 2.2 | Get tenant | | |
| 2.3 | Get missing tenant | | |
| 2.4 | Create tenant | | |
| 2.5 | Duplicate slug | | |
| 3.1 | Create key | | |
| 3.2 | Create expired key | | |
| 3.3 | Revoke key | | |
| 3.4 | Revoke again | | |
| 4.1 | Valid API key | | |
| 4.2 | Missing API key | | |
| 4.3 | Invalid API key | | |
| 4.4 | Revoked API key | | |
| 4.5 | Expired API key | | |
| 5.1 | Get permissions | | |
| 5.2 | Disable tool | | |
| 5.3 | Verify disabled | | |
| 5.4 | Re-enable tool | | |
| 6.1 | Update ERP config | | |
| 6.2 | Test connection | | |
| 7.1 | list_products | | |
| 7.2 | get_product | | |
| 7.3 | list_stock_levels | | |
| 7.4 | get_stock_level | | |
| 7.5 | list_low_stock | | |
| 7.6 | list_suppliers | | |
| 7.7 | get_supplier | | |
| 8.1 | list_orders | | |
| 8.2 | get_order | | |
| 8.3 | list_invoices | | |
| 8.4 | get_invoice | | |
| 8.5 | list_overdue_invoices | | |
| 8.6 | get_payment_summary | | |
| 9.1 | list_contacts | | |
| 9.2 | get_contact | | |
| 9.3 | search_contacts | | |
| 9.4 | get_contact_orders | | |
| 9.5 | get_contact_invoices | | |
| 10.1 | search_kb | | |
| 10.2 | get_kb_article | | |
| 10.3 | get_kb_sync_status | | |
| 11.1 | create_stock_entry | | |
| 11.2 | update_stock_entry | | |
| 11.3 | create_invoice | | |
| 11.4 | update_invoice | | |
| 11.5 | create_contact | | |
| 11.6 | update_contact | | |
| 12.1 | Upload doc | | |
| 12.2 | List docs | | |
| 12.3 | Get doc | | |
| 12.4 | Update doc | | |
| 12.5 | Delete doc | | |
| 13.1 | Audit unfiltered | | |
| 13.2 | Audit by tool | | |
| 13.3 | Audit by status | | |
| 14.1 | List all tools | | |
| 15.1 | 27 tools count | | |
| 15.2 | Disabled tool error | | |
