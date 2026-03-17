import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import postgres from 'postgres';
import { z } from 'zod';
import { getTenantId } from '../context.js';
import { withTenantContext } from '../db/client.js';
import { toolError, toolSuccess } from './errors.js';

/**
 * Register all 7 inventory MCP tools on the provided McpServer instance.
 *
 * Tools registered:
 *   INV-01  list_products        — paginated product list with qty_on_hand JOIN
 *   INV-02  get_product          — single product by ID
 *   INV-03  list_stock_levels    — paginated stock_levels list
 *   INV-04  get_stock_level      — single stock level by ID
 *   INV-05  list_low_stock       — products below reorder_point
 *   INV-06  list_suppliers       — paginated suppliers list
 *   INV-07  get_supplier         — single supplier by ID (no products — no FK exists)
 *
 * CRITICAL: All queries use raw txSql inside withTenantContext — NOT the db Drizzle export.
 * The Drizzle db instance does not execute within the tenant transaction context.
 */
export function registerInventoryTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // INV-01: list_products — paginated product list with qty_on_hand
  // -------------------------------------------------------------------------
  server.tool(
    'list_products',
    'List all products for the tenant. Each product includes qty_on_hand from the most recent stock level record. Supports pagination via limit and offset.',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count FROM products
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT
              p.id,
              p.sku,
              p.name,
              p.description,
              p.price,
              p.currency,
              p.category,
              p.is_active,
              p.reorder_point,
              p.created_at,
              p.updated_at,
              COALESCE(sl.quantity_on_hand, 0) AS qty_on_hand,
              sl.warehouse_location
            FROM products p
            LEFT JOIN stock_levels sl ON sl.product_id = p.id
            ORDER BY p.name ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] list_products error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-02: get_product — single product with current stock level
  // -------------------------------------------------------------------------
  server.tool(
    'get_product',
    'Get full details for a single product by its UUID, including current stock level.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const rows = await txSql`
            SELECT
              p.id,
              p.sku,
              p.name,
              p.description,
              p.price,
              p.currency,
              p.category,
              p.is_active,
              p.reorder_point,
              p.created_at,
              p.updated_at,
              COALESCE(sl.quantity_on_hand, 0) AS qty_on_hand,
              sl.warehouse_location
            FROM products p
            LEFT JOIN stock_levels sl ON sl.product_id = p.id
            WHERE p.id = ${id}
          `;
          return rows[0] ?? null;
        });
        if (!result) {
          return toolError('NOT_FOUND', 'Product not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] get_product error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-03: list_stock_levels — paginated stock levels
  // -------------------------------------------------------------------------
  server.tool(
    'list_stock_levels',
    'List all stock level records for the tenant with pagination. Each record includes product_id and warehouse location.',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count FROM stock_levels
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT
              sl.id,
              sl.product_id,
              sl.quantity_on_hand,
              sl.warehouse_location,
              sl.created_at,
              sl.updated_at,
              p.sku AS product_sku,
              p.name AS product_name
            FROM stock_levels sl
            JOIN products p ON p.id = sl.product_id
            ORDER BY p.name ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] list_stock_levels error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-04: get_stock_level — single stock level record by ID
  // -------------------------------------------------------------------------
  server.tool(
    'get_stock_level',
    'Get a single stock level record by its UUID, including product name and SKU.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const rows = await txSql`
            SELECT
              sl.id,
              sl.product_id,
              sl.quantity_on_hand,
              sl.warehouse_location,
              sl.created_at,
              sl.updated_at,
              p.sku AS product_sku,
              p.name AS product_name
            FROM stock_levels sl
            JOIN products p ON p.id = sl.product_id
            WHERE sl.id = ${id}
          `;
          return rows[0] ?? null;
        });
        if (!result) {
          return toolError('NOT_FOUND', 'Stock level not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] get_stock_level error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-05: list_low_stock — products below reorder_point
  // -------------------------------------------------------------------------
  server.tool(
    'list_low_stock',
    'List all active products where current quantity_on_hand is below the reorder_point threshold. Returns empty list if all stock levels are adequate.',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count
            FROM products p
            LEFT JOIN stock_levels sl ON sl.product_id = p.id
            WHERE p.is_active = true
              AND COALESCE(sl.quantity_on_hand, 0) < p.reorder_point
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT
              p.id,
              p.sku,
              p.name,
              p.reorder_point,
              COALESCE(sl.quantity_on_hand, 0) AS qty_on_hand,
              sl.warehouse_location
            FROM products p
            LEFT JOIN stock_levels sl ON sl.product_id = p.id
            WHERE p.is_active = true
              AND COALESCE(sl.quantity_on_hand, 0) < p.reorder_point
            ORDER BY (p.reorder_point - COALESCE(sl.quantity_on_hand, 0)) DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] list_low_stock error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-06: list_suppliers — paginated suppliers list
  // -------------------------------------------------------------------------
  server.tool(
    'list_suppliers',
    'List all suppliers for the tenant with pagination.',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count FROM suppliers
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT
              id,
              name,
              email,
              phone,
              address,
              notes,
              created_at,
              updated_at
            FROM suppliers
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] list_suppliers error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // INV-07: get_supplier — single supplier by ID
  // NOTE: products table has no supplier_id FK — return supplier fields only
  // -------------------------------------------------------------------------
  server.tool(
    'get_supplier',
    'Get full details for a single supplier by its UUID. Note: the products table does not have a supplier_id column in v1, so no linked products are returned.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const rows = await txSql`
            SELECT
              id,
              name,
              email,
              phone,
              address,
              notes,
              created_at,
              updated_at
            FROM suppliers
            WHERE id = ${id}
          `;
          return rows[0] ?? null;
        });
        if (!result) {
          return toolError('NOT_FOUND', 'Supplier not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/inventory] get_supplier error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );
}
