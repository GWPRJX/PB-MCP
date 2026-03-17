import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import postgres from 'postgres';
import { z } from 'zod';
import { getTenantId } from '../context.js';
import { withTenantContext } from '../db/client.js';
import { toolError, toolSuccess } from './errors.js';

/**
 * Register all 6 orders/billing MCP tools on the provided McpServer instance.
 *
 * Tools registered:
 *   ORD-01  list_orders             — paginated orders with optional status filter
 *   ORD-02  get_order               — single order with line items + linked contact inline
 *   ORD-03  list_invoices           — paginated invoices with optional status filter
 *   ORD-04  get_invoice             — single invoice by ID
 *   ORD-05  list_overdue_invoices   — invoices past due or marked overdue
 *   ORD-06  get_payment_summary     — tenant-level payment aggregate
 *
 * CRITICAL: All queries use raw txSql inside withTenantContext — NOT the db Drizzle export.
 * The Drizzle db instance does not execute within the tenant transaction context.
 */
export function registerOrdersTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // ORD-01: list_orders — paginated orders with optional status filter
  // -------------------------------------------------------------------------
  server.tool(
    'list_orders',
    'List all orders for the tenant with pagination. Optionally filter by status (e.g., draft, confirmed, shipped, cancelled).',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
      status: z.string().optional(),
    },
    async ({ limit = 200, offset = 0, status }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          const [{ count }] = status
            ? await txSql`SELECT COUNT(*) AS count FROM orders WHERE status = ${status}` as [{ count: string }]
            : await txSql`SELECT COUNT(*) AS count FROM orders` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = status
            ? await txSql`
                SELECT id, tenant_id, contact_id, status, order_date, subtotal, tax_amount, total, notes, created_at
                FROM orders
                WHERE status = ${status}
                ORDER BY order_date DESC, created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : await txSql`
                SELECT id, tenant_id, contact_id, status, order_date, subtotal, tax_amount, total, notes, created_at
                FROM orders
                ORDER BY order_date DESC, created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] list_orders error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // ORD-02: get_order — single order with line items + linked contact inline
  // Two queries: (1) order + contact JOIN, (2) line items + products JOIN
  // -------------------------------------------------------------------------
  server.tool(
    'get_order',
    'Get full details for a single order by its UUID, including all line items with product details and the linked contact.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          // Query 1: order fields + contact JOIN
          const orderRows = await txSql`
            SELECT
              o.id,
              o.tenant_id,
              o.contact_id,
              o.status,
              o.order_date,
              o.subtotal,
              o.tax_amount,
              o.total,
              o.notes,
              o.created_at,
              o.updated_at,
              c.id AS contact__id,
              c.name AS contact__name,
              c.email AS contact__email,
              c.phone AS contact__phone
            FROM orders o
            LEFT JOIN contacts c ON c.id = o.contact_id
            WHERE o.id = ${id}
          `;

          if (orderRows.length === 0) return null;

          const row = orderRows[0];
          const order = {
            id: row.id,
            tenant_id: row.tenant_id,
            contact_id: row.contact_id,
            status: row.status,
            order_date: row.order_date,
            subtotal: row.subtotal,
            tax_amount: row.tax_amount,
            total: row.total,
            notes: row.notes,
            created_at: row.created_at,
            updated_at: row.updated_at,
            contact: row.contact__id
              ? { id: row.contact__id, name: row.contact__name, email: row.contact__email, phone: row.contact__phone }
              : null,
          };

          // Query 2: line items + products JOIN
          const lineItems = await txSql`
            SELECT
              li.id,
              li.product_id,
              p.name AS product_name,
              p.sku AS product_sku,
              li.quantity,
              li.unit_price,
              li.line_total
            FROM order_line_items li
            JOIN products p ON p.id = li.product_id
            WHERE li.order_id = ${id}
            ORDER BY li.created_at ASC
          `;

          return { ...order, line_items: lineItems };
        });

        if (!result) {
          return toolError('NOT_FOUND', 'Order not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] get_order error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // ORD-03: list_invoices — paginated invoices with optional status filter
  // -------------------------------------------------------------------------
  server.tool(
    'list_invoices',
    'List all invoices for the tenant with pagination. Optionally filter by status (e.g., draft, unpaid, paid, overdue, cancelled).',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
      status: z.string().optional(),
    },
    async ({ limit = 200, offset = 0, status }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          const [{ count }] = status
            ? await txSql`SELECT COUNT(*) AS count FROM invoices WHERE status = ${status}` as [{ count: string }]
            : await txSql`SELECT COUNT(*) AS count FROM invoices` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = status
            ? await txSql`
                SELECT id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total, notes, created_at
                FROM invoices
                WHERE status = ${status}
                ORDER BY issued_at DESC, created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : await txSql`
                SELECT id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total, notes, created_at
                FROM invoices
                ORDER BY issued_at DESC, created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] list_invoices error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // ORD-04: get_invoice — single invoice by ID
  // -------------------------------------------------------------------------
  server.tool(
    'get_invoice',
    'Get full details for a single invoice by its UUID.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const rows = await txSql`
            SELECT id, tenant_id, order_id, contact_id, status, issued_at, due_at, paid_at,
                   subtotal, tax_amount, total, notes, created_at, updated_at
            FROM invoices
            WHERE id = ${id}
          `;
          return rows[0] ?? null;
        });
        if (!result) {
          return toolError('NOT_FOUND', 'Invoice not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] get_invoice error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // ORD-05: list_overdue_invoices — invoices past due or explicitly marked overdue
  // Logic: status = 'overdue' OR (due_at < CURRENT_DATE AND status NOT IN ('paid','cancelled'))
  // -------------------------------------------------------------------------
  server.tool(
    'list_overdue_invoices',
    'List all overdue invoices for the tenant. Returns invoices with status=overdue or those past their due date that are not paid or cancelled.',
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
            FROM invoices
            WHERE status = 'overdue'
               OR (due_at < CURRENT_DATE AND status NOT IN ('paid', 'cancelled'))
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total, notes, created_at
            FROM invoices
            WHERE status = 'overdue'
               OR (due_at < CURRENT_DATE AND status NOT IN ('paid', 'cancelled'))
            ORDER BY due_at ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] list_overdue_invoices error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // ORD-06: get_payment_summary — tenant-level payment aggregate
  // Three scalar queries: total_invoiced, total_paid, overdue_count
  // outstanding_balance computed as total_invoiced - total_paid in JS
  // -------------------------------------------------------------------------
  server.tool(
    'get_payment_summary',
    'Get a payment summary for the tenant: total invoiced amount, total paid, outstanding balance, and count of overdue invoices.',
    {},
    async () => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          const [{ total_invoiced }] = await txSql`
            SELECT COALESCE(SUM(total), 0)::text AS total_invoiced FROM invoices
          ` as [{ total_invoiced: string }];

          const [{ total_paid }] = await txSql`
            SELECT COALESCE(SUM(total), 0)::text AS total_paid FROM invoices WHERE status = 'paid'
          ` as [{ total_paid: string }];

          const [{ overdue_count }] = await txSql`
            SELECT COUNT(*)::int AS overdue_count
            FROM invoices
            WHERE status = 'overdue'
               OR (due_at < CURRENT_DATE AND status NOT IN ('paid', 'cancelled'))
          ` as [{ overdue_count: number }];

          const outstanding_balance = (parseFloat(total_invoiced) - parseFloat(total_paid)).toFixed(2);

          return {
            total_invoiced,
            total_paid,
            outstanding_balance,
            overdue_count,
          };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/orders] get_payment_summary error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );
}
