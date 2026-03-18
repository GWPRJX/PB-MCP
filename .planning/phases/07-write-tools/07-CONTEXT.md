---
phase: 07-write-tools
name: Write Tools
requirements: [WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05, WRITE-06]
depends_on: [phase-05, phase-06]
---

# Phase 7 Context: Write Tools

## Goal

AI clients can create and modify stock entries, invoices, and contacts through MCP tools — all write operations go through the live POSibolt API with proper validation, audit logging, and tool access control.

## What Already Exists

### Write infrastructure (all in place)
- **`pbPost()`** in `src/posibolt/client.ts` — Authenticated POST to POSibolt REST API, JSON body, token caching
- **`withAudit()`** in `src/tools/errors.ts` — Automatic audit logging wrapper for tool handlers
- **`shouldRegister()`** in `src/tools/errors.ts` — Tool access control filter guard
- **`toolSuccess()` / `toolError()`** in `src/tools/errors.ts` — Standardized MCP response helpers
- **`getErpConfig()`** in `src/context.ts` — Gets tenant's POSibolt config from AsyncLocalStorage
- **`createMcpServer(enabledTools)`** in `src/mcp/server.ts` — Registers tools with optional filter Set
- **`ALL_TOOLS`** in `src/admin/tool-permissions-service.ts` — Master list for dashboard tool permissions
- **`invalidateToken()`** in `src/posibolt/client.ts` — Token cache invalidation for 401 retries

### Read tool patterns (21 tools across 4 files)
All follow: `shouldRegister()` → `server.tool(name, description, zodSchema, withAudit(name, handler))` → `getErpConfig()` → `pbGet/pbPost` → `toolSuccess/toolError`. Never throw from handler.

## POSibolt Write API Endpoints

### Stock/Inventory
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/stocktransferrequest` | POST | Create stock transfer request (inter-warehouse movement) |
| `/stocktransfer/completestocktransfer` | POST | Complete a stock transfer (immediate or from draft) |
| `/stocktransfer/draftstocktransfer` | POST | Save stock transfer as draft |
| `/stocktransfer/getstocktransfer` | GET | Get draft transfer details by stockTransferId |

**Create stock entry JSON (stock transfer request):**
```json
{
  "dateFormat": "dd-MM-yyyy",
  "dateRequired": "30-01-2026",
  "fromWarehouseId": 1000505,
  "toWarehouseId": 1000498,
  "lines": [{
    "moveAllQty": false,
    "productId": 1592824,
    "productName": "PENCIL",
    "qty": 1,
    "reqQty": 1,
    "sku": "p111",
    "uom": "Each",
    "upc": "p123",
    "warehouseId": 0
  }]
}
```

**Complete stock transfer JSON:**
```json
{
  "comments": "testing",
  "issuedBy": "admin",
  "toWarehouseId": "1000498",
  "transferDate": "30-01-2026",
  "stockTransferId": 0,
  "lines": [{
    "movementLineId": 0,
    "productId": 1613225,
    "qty": "1",
    "requisitionLineId": 1001674,
    "uom": "Each",
    "uomId": 100,
    "batchNo": "",
    "expiryDate": "07-03-2025"
  }]
}
```

### Sales Invoice / Order
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/salesinvoice/createorderinvoice` | POST | Create sales order + invoice together |
| `/salesorder/createorder` | POST | Create sales order only |
| `/salesorder/cancelorder` | POST | Cancel an existing order |

**Create invoice JSON:**
```json
{
  "dateInvoiced": "25-11-2025",
  "invoiceNo": "IN/AD/17409141S",
  "dateFormat": "dd-MM-yyyy",
  "customerId": 1023058,
  "priceListId": 1000595,
  "roundOff": 0,
  "description": "",
  "salesRepId": 1001830,
  "paymentType": "Cash",
  "grandTotal": 2000,
  "discountAmt": 0,
  "warehouseId": 1000505,
  "checkoutTime": 1764064001721,
  "invoiceLineList": [{
    "chargeId": 0,
    "discountAmt": 0,
    "discountPercentage": 0,
    "unitPrice": 1000,
    "orderLineId": 0,
    "qty": 2,
    "taxAmt": 0,
    "isFreeItem": false,
    "productId": 1593374,
    "uom": "Each"
  }],
  "payments": [{
    "bpartnerType": "customer",
    "customerId": 1023058,
    "receipt": true,
    "amount": 2000,
    "description": "",
    "date": "25-11-2025",
    "dateFormat": "dd-MM-yyyy",
    "discountAmt": 0,
    "paymentType": "Cash",
    "paymentNo": "PR/AD/NSZ1635134S"
  }]
}
```

### Customer / Business Partner
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/customermaster` | POST | Create new customer/vendor |
| `/customermaster/{customerId}` | POST | Update existing customer/vendor |
| `/customermaster/searchcustomers` | GET | Search by code/email/mobile/name |

**Create/Update customer JSON:**
```json
{
  "customerCode": "CUST00321",
  "name": "testname",
  "customerGroup": "standard",
  "address1": "testaddress1",
  "address2": "testaddress2",
  "city": "testcity",
  "country": "india",
  "region": "testState",
  "email": "testmail@gmail.com",
  "active": true,
  "action": "create"
}
```

**Success response pattern:**
```json
{
  "responseCode": 200,
  "message": "Success",
  "record": "customer",
  "recordNo": 10000001,
  "detailedMessage": "Entry Created Successfully"
}
```

## POSibolt API Constraints

1. **Completed transactions cannot be updated** — once a record is completed (status "CO"), it's immutable. Only draft ("DR") records can be modified.
2. **Transactions are terminal-based** — the terminal from OAuth login is associated with the transaction.
3. **Max 2000 records per request** — all POST responses return JSON with status code & message.
4. **Date format** — POSibolt uses `dd-MM-yyyy` format, always pass `dateFormat: "dd-MM-yyyy"`.

## Decisions

- **`create_stock_entry`** maps to `POST /stocktransferrequest` — creates a stock transfer request (the standard mechanism for inventory adjustments between warehouses in POSibolt)
- **`update_stock_entry`** maps to `POST /stocktransfer/completestocktransfer` — completes an existing draft stock transfer (since completed transfers are immutable, "update" means completing a pending transfer)
- **`create_invoice`** maps to `POST /salesinvoice/createorderinvoice` — creates a sales order and invoice together (most common use case)
- **`update_invoice`** maps to `POST /salesorder/cancelorder` — cancels an existing order/invoice (POSibolt does not support modifying completed invoices; the tool description will clarify this is for cancellation)
- **`create_contact`** maps to `POST /customermaster` with `action: "create"` — creates a new business partner (customer or vendor)
- **`update_contact`** maps to `POST /customermaster/{customerId}` with `action: "update"` — updates an existing business partner
- **New tool file**: `src/tools/write.ts` — keeps write tools separate from read tools for clarity
- **Date handling**: Tools accept ISO date strings (YYYY-MM-DD) from AI clients and convert to POSibolt's `dd-MM-yyyy` format internally
