import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getErpConfig } from '../context.js';
import { pbGet } from '../posibolt/client.js';
import { toolError, toolSuccess } from './errors.js';

/* ------------------------------------------------------------------ */
/*  POSibolt product-list response shape                              */
/* ------------------------------------------------------------------ */
interface PbProduct {
  productId: number;
  name: string;
  description: string | null;
  sku: string;
  salesPrice: number;
  costPrice: number;
  mrpPrice: number;
  stockQty: number;
  uom: string;
  isActive: boolean;
  productCategoryId: number;
  productCategory: string;
  upc: string | null;
}

/* ------------------------------------------------------------------ */
/*  POSibolt warehouse inventory response shape                       */
/* ------------------------------------------------------------------ */
interface PbWarehouseInventory {
  warehouseId: number;
  warehouseName: string;
  productId: number;
  productName: string;
  sku: string;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
}

/**
 * Register all 7 inventory MCP tools on the provided McpServer instance.
 *
 * Tools registered (backed by POSibolt REST API):
 *   INV-01  list_products        -- paginated product list via /productmaster/productlist
 *   INV-02  get_product          -- product search via /productmaster/search
 *   INV-03  list_stock_levels    -- warehouse inventory via /warehousemaster/getWareHouseInventory
 *   INV-04  get_stock_level      -- product stock lookup via /productmaster/search
 *   INV-05  list_low_stock       -- products with stockQty below threshold
 *   INV-06  list_suppliers       -- vendor listing guidance (delegates to search_contacts)
 *   INV-07  get_supplier         -- single vendor via /customermaster/{vendorId}
 */
export function registerInventoryTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // INV-01: list_products -- paginated product list from POSibolt
  // -------------------------------------------------------------------------
  server.tool(
    'list_products',
    'List active products from POSibolt ERP. Returns product name, SKU, prices, stock quantity, UOM, and category. Supports pagination via limit and offset.',
    {
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit = 200, offset = 0 }) => {
      try {
        const config = getErpConfig();
        const data = await pbGet<PbProduct[]>(config, '/productmaster/productlist', {
          limitByOrg: true,
          limit,
          offset,
          updatedSince: 0,
          isactive: true,
        });

        const items = (data ?? []).map((p) => ({
          productId: p.productId,
          name: p.name,
          description: p.description,
          sku: p.sku,
          salesPrice: p.salesPrice,
          costPrice: p.costPrice,
          mrpPrice: p.mrpPrice,
          stockQty: p.stockQty,
          uom: p.uom,
          isActive: p.isActive,
          category: p.productCategory,
          categoryId: p.productCategoryId,
          upc: p.upc,
        }));

        const nextCursor = items.length === limit ? offset + limit : null;
        return toolSuccess({
          items,
          count: items.length,
          next_cursor: nextCursor,
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] list_products error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-02: get_product -- search for a single product by text
  // -------------------------------------------------------------------------
  server.tool(
    'get_product',
    'Search for a product by name, SKU, or barcode text. Returns the best-matching product with full pricing and stock info.',
    {
      searchText: z.string().min(1).describe('Product name, SKU, or barcode to search for'),
    },
    async ({ searchText }) => {
      try {
        const config = getErpConfig();
        const data = await pbGet<PbProduct[]>(config, '/productmaster/search', {
          searchText,
          limit: 1,
        });

        const results = Array.isArray(data) ? data : [];
        if (results.length === 0) {
          return toolError('NOT_FOUND', `No product found matching "${searchText}"`);
        }

        const p = results[0];
        return toolSuccess({
          productId: p.productId,
          name: p.name,
          description: p.description,
          sku: p.sku,
          salesPrice: p.salesPrice,
          costPrice: p.costPrice,
          mrpPrice: p.mrpPrice,
          stockQty: p.stockQty,
          uom: p.uom,
          isActive: p.isActive,
          category: p.productCategory,
          categoryId: p.productCategoryId,
          upc: p.upc,
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] get_product error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-03: list_stock_levels -- warehouse inventory from POSibolt
  // -------------------------------------------------------------------------
  server.tool(
    'list_stock_levels',
    'List warehouse inventory levels from POSibolt. Optionally filter by warehouseId. Returns product stock quantities per warehouse.',
    {
      warehouseId: z
        .number()
        .int()
        .optional()
        .describe('POSibolt warehouse ID to filter by (omit for all warehouses)'),
    },
    async ({ warehouseId }) => {
      try {
        const config = getErpConfig();
        const params: Record<string, string | number | boolean> = {};
        if (warehouseId !== undefined) {
          params.warehouseId = warehouseId;
        }

        const data = await pbGet<PbWarehouseInventory[]>(
          config,
          '/warehousemaster/getWareHouseInventory',
          params,
        );

        const items = Array.isArray(data) ? data : [];
        return toolSuccess({
          items,
          count: items.length,
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] list_stock_levels error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-04: get_stock_level -- stock info for a specific product
  // -------------------------------------------------------------------------
  server.tool(
    'get_stock_level',
    'Get current stock level for a specific product by searching its name or SKU. Returns stock quantity and pricing details.',
    {
      searchText: z
        .string()
        .min(1)
        .describe('Product name, SKU, or barcode to look up stock for'),
    },
    async ({ searchText }) => {
      try {
        const config = getErpConfig();
        const data = await pbGet<PbProduct[]>(config, '/productmaster/search', {
          searchText,
          limit: 5,
        });

        const results = Array.isArray(data) ? data : [];
        if (results.length === 0) {
          return toolError('NOT_FOUND', `No product found matching "${searchText}"`);
        }

        const items = results.map((p) => ({
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          stockQty: p.stockQty,
          uom: p.uom,
          salesPrice: p.salesPrice,
        }));

        return toolSuccess({
          items,
          count: items.length,
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] get_stock_level error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-05: list_low_stock -- products below a stock threshold
  // -------------------------------------------------------------------------
  server.tool(
    'list_low_stock',
    'List active products whose current stock quantity is below the given threshold. Fetches the full product list from POSibolt and filters client-side.',
    {
      threshold: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Stock quantity threshold (default 10). Products with stockQty below this are returned.'),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ threshold = 10, limit = 200, offset = 0 }) => {
      try {
        const config = getErpConfig();

        // Fetch a large batch of active products; filter those below threshold
        const data = await pbGet<PbProduct[]>(config, '/productmaster/productlist', {
          limitByOrg: true,
          limit: 500,
          offset: 0,
          updatedSince: 0,
          isactive: true,
        });

        const all = (data ?? []).filter(
          (p) => p.isActive && p.stockQty < threshold,
        );

        // Sort by deficit (most critical first)
        all.sort((a, b) => a.stockQty - b.stockQty);

        const paged = all.slice(offset, offset + limit);
        const nextCursor = offset + paged.length < all.length ? offset + limit : null;

        const items = paged.map((p) => ({
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          stockQty: p.stockQty,
          threshold,
          deficit: threshold - p.stockQty,
          uom: p.uom,
          salesPrice: p.salesPrice,
          category: p.productCategory,
        }));

        return toolSuccess({
          items,
          total_count: all.length,
          next_cursor: nextCursor,
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] list_low_stock error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-06: list_suppliers -- vendor listing guidance
  // -------------------------------------------------------------------------
  server.tool(
    'list_suppliers',
    'Vendor/supplier listing. POSibolt stores vendors in the business-partner master which can be very large. Use the search_contacts tool with type="vendor" for filtered results instead.',
    {},
    async () => {
      try {
        return toolSuccess({
          message:
            'POSibolt stores vendors as business partners. The full list can be very large. ' +
            'Please use the search_contacts tool with type="vendor" to search for specific vendors by name or other criteria.',
          suggestion: 'search_contacts',
          suggestedParams: { type: 'vendor', searchText: '<vendor name>' },
        });
      } catch (err) {
        process.stderr.write(
          `[tools/inventory] list_suppliers error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    },
  );

  // -------------------------------------------------------------------------
  // INV-07: get_supplier -- single vendor by POSibolt ID
  // -------------------------------------------------------------------------
  server.tool(
    'get_supplier',
    'Get full details for a single vendor/supplier by their POSibolt business-partner ID.',
    {
      vendorId: z.number().int().describe('POSibolt business-partner ID of the vendor'),
    },
    async ({ vendorId }) => {
      try {
        const config = getErpConfig();
        const data = await pbGet<Record<string, unknown>>(
          config,
          `/customermaster/${vendorId}`,
        );

        if (!data) {
          return toolError('NOT_FOUND', `Vendor with ID ${vendorId} not found`);
        }

        return toolSuccess(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Distinguish 404-like errors from true failures
        if (msg.includes('404') || msg.includes('not found')) {
          return toolError('NOT_FOUND', `Vendor with ID ${vendorId} not found`);
        }
        process.stderr.write(`[tools/inventory] get_supplier error: ${msg}\n`);
        return toolError('INTERNAL_ERROR', msg);
      }
    },
  );
}
