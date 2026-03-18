import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getErpConfig } from '../context.js';
import { pbGet } from '../posibolt/client.js';
import { toolError, toolSuccess, shouldRegister, withAudit } from './errors.js';

/* ------------------------------------------------------------------ */
/*  POSibolt business-partner (BP) response shape                     */
/* ------------------------------------------------------------------ */

interface BpListItem {
  customerId: number;
  name: string;
  name2?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  city?: string;
  country?: string;
  address1?: string;
  customer?: boolean;
  vendor?: boolean;
  active?: boolean;
  creditLimit?: number;
  creditStatus?: string;
}

interface BpDetail extends BpListItem {
  [key: string]: unknown; // allow extra fields from detailed endpoint
}

interface PendingOrder {
  [key: string]: unknown;
}

interface OpenInvoice {
  [key: string]: unknown;
}

/**
 * Register all 5 CRM MCP tools on the provided McpServer instance.
 *
 * Tools registered:
 *   CRM-01  list_contacts          -- paginated business partners from POSibolt
 *   CRM-02  get_contact            -- single customer by customerId
 *   CRM-03  search_contacts        -- filter allbplist by name/email in JS
 *   CRM-04  get_contact_orders     -- pending customer orders
 *   CRM-05  get_contact_invoices   -- open invoices + balances
 *
 * All tools call POSibolt REST API via pbGet (no local PostgreSQL).
 */
export function registerCrmTools(server: McpServer, filter?: Set<string> | null): void {
  // -------------------------------------------------------------------------
  // CRM-01: list_contacts -- paginated business partners
  //
  // WARNING: GET /customermaster/allbplist returns ALL business partners
  // (can be 30K+). Pagination is applied in JS after fetching.
  // For targeted lookups prefer search_contacts instead.
  // -------------------------------------------------------------------------
  if (shouldRegister('list_contacts', filter)) server.tool(
    'list_contacts',
    'List business partners (customers/vendors) with pagination. WARNING: fetches full list from POSibolt then slices -- prefer search_contacts for targeted lookups. Optionally filter by type: "customer" or "vendor".',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
      type: z.enum(['customer', 'vendor']).optional(),
    },
    withAudit('list_contacts', async ({ limit = 50, offset = 0, type }) => {
      try {
        const config = getErpConfig();
        const allBp = await pbGet<BpListItem[]>(config, '/customermaster/allbplist');
        const list = Array.isArray(allBp) ? allBp : [];

        // Optional type filter
        const filtered = type
          ? list.filter((bp) =>
              type === 'customer' ? bp.customer === true : bp.vendor === true,
            )
          : list;

        const totalCount = filtered.length;
        const items = filtered.slice(offset, offset + limit);
        const nextCursor = offset + items.length < totalCount ? offset + limit : null;

        return toolSuccess({ items, total_count: totalCount, next_cursor: nextCursor });
      } catch (err) {
        process.stderr.write(`[tools/crm] list_contacts error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // CRM-02: get_contact -- single customer by customerId (number)
  // -------------------------------------------------------------------------
  if (shouldRegister('get_contact', filter)) server.tool(
    'get_contact',
    'Get full details for a single business partner by its POSibolt customerId (number).',
    {
      customerId: z.number().int().positive(),
    },
    withAudit('get_contact', async ({ customerId }) => {
      try {
        const config = getErpConfig();
        const detail = await pbGet<BpDetail>(config, `/customermaster/${customerId}`);
        if (!detail) {
          return toolError('NOT_FOUND', `Customer ${customerId} not found`);
        }
        return toolSuccess(detail);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // POSibolt returns 404 or empty for missing customers
        if (msg.includes('404')) {
          return toolError('NOT_FOUND', `Customer ${customerId} not found`);
        }
        process.stderr.write(`[tools/crm] get_contact error: ${msg}\n`);
        return toolError('INTERNAL_ERROR', msg);
      }
    }),
  );

  // -------------------------------------------------------------------------
  // CRM-03: search_contacts -- filter allbplist by name/email in JS
  //
  // POSibolt has no dedicated customer search endpoint, so we fetch the full
  // BP list and filter client-side with case-insensitive matching.
  // -------------------------------------------------------------------------
  if (shouldRegister('search_contacts', filter)) server.tool(
    'search_contacts',
    'Search business partners by name or email (case-insensitive). Fetches full BP list from POSibolt and filters in JS.',
    {
      query: z.string().min(1),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    withAudit('search_contacts', async ({ query, limit = 50, offset = 0 }) => {
      try {
        const config = getErpConfig();
        const allBp = await pbGet<BpListItem[]>(config, '/customermaster/allbplist');
        const list = Array.isArray(allBp) ? allBp : [];

        const q = query.toLowerCase();
        const filtered = list.filter((bp) => {
          const name = (bp.name ?? '').toLowerCase();
          const name2 = (bp.name2 ?? '').toLowerCase();
          const email = (bp.email ?? '').toLowerCase();
          return name.includes(q) || name2.includes(q) || email.includes(q);
        });

        const totalCount = filtered.length;
        const items = filtered.slice(offset, offset + limit);
        const nextCursor = offset + items.length < totalCount ? offset + limit : null;

        return toolSuccess({ items, total_count: totalCount, next_cursor: nextCursor });
      } catch (err) {
        process.stderr.write(`[tools/crm] search_contacts error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // CRM-04: get_contact_orders -- pending customer orders
  // -------------------------------------------------------------------------
  if (shouldRegister('get_contact_orders', filter)) server.tool(
    'get_contact_orders',
    'Get pending sales orders for a customer by POSibolt customerId (number).',
    {
      customerId: z.number().int().positive(),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    withAudit('get_contact_orders', async ({ customerId, limit = 50, offset = 0 }) => {
      try {
        const config = getErpConfig();
        const orders = await pbGet<PendingOrder[]>(
          config,
          `/salesorder/pendingcustomerorders/${customerId}`,
        );
        const list = Array.isArray(orders) ? orders : [];

        const totalCount = list.length;
        const items = list.slice(offset, offset + limit);
        const nextCursor = offset + items.length < totalCount ? offset + limit : null;

        return toolSuccess({ items, total_count: totalCount, next_cursor: nextCursor });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404')) {
          return toolError('NOT_FOUND', `Customer ${customerId} not found or has no pending orders`);
        }
        process.stderr.write(`[tools/crm] get_contact_orders error: ${msg}\n`);
        return toolError('INTERNAL_ERROR', msg);
      }
    }),
  );

  // -------------------------------------------------------------------------
  // CRM-05: get_contact_invoices -- open invoices + balances
  // -------------------------------------------------------------------------
  if (shouldRegister('get_contact_invoices', filter)) server.tool(
    'get_contact_invoices',
    'Get open invoices and outstanding balance for a customer by POSibolt customerId (number).',
    {
      customerId: z.number().int().positive(),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    withAudit('get_contact_invoices', async ({ customerId, limit = 50, offset = 0 }) => {
      try {
        const config = getErpConfig();
        const invoices = await pbGet<OpenInvoice[]>(
          config,
          '/customermaster/getCustomerOpenInvoices',
          { customerId },
        );
        const list = Array.isArray(invoices) ? invoices : [];

        const totalCount = list.length;
        const items = list.slice(offset, offset + limit);
        const nextCursor = offset + items.length < totalCount ? offset + limit : null;

        // Compute outstanding balance from full list
        let outstandingBalance = 0;
        for (const inv of list) {
          const amt = Number(inv.openAmt ?? inv.grandTotal ?? inv.total ?? 0);
          if (!Number.isNaN(amt)) outstandingBalance += amt;
        }

        return toolSuccess({
          items,
          total_count: totalCount,
          next_cursor: nextCursor,
          outstanding_balance: outstandingBalance,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404')) {
          return toolError('NOT_FOUND', `Customer ${customerId} not found or has no open invoices`);
        }
        process.stderr.write(`[tools/crm] get_contact_invoices error: ${msg}\n`);
        return toolError('INTERNAL_ERROR', msg);
      }
    }),
  );
}
