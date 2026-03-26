import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getErpConfig } from '../context.js';
import { pbGet } from '../posibolt/client.js';
import { toolError, toolSuccess, shouldRegister, withAudit } from './errors.js';
import { logger } from '../logger.js';
import { getToolEndpoint } from './config.js';

/* ------------------------------------------------------------------ */
/*  Helper: date formatting                                            */
/* ------------------------------------------------------------------ */

/**
 * Format a Date as a YYYY-MM-DD string for POSibolt salesorder endpoints.
 *
 * @param d - The date to format.
 * @returns ISO date string truncated to 10 characters (e.g. `"2024-03-15"`).
 */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the default "from" date for order/invoice queries: 30 days before today.
 *
 * @returns A new Date set to today minus 30 days.
 */
function defaultFromDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

/* ------------------------------------------------------------------ */
/*  POSibolt response types (minimal — only fields we surface)         */
/* ------------------------------------------------------------------ */

interface SalesHistoryLine {
  productName?: string;
  productCode?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  uom?: string;
}

interface PaymentDetail {
  paymentMethod?: string;
  amount?: number;
  referenceNo?: string;
}

interface SalesHistoryItem {
  customerName?: string;
  orderNo?: string;
  invoiceNo?: string;
  dateCreated?: string;
  invoiceAmount?: number;
  salesRepName?: string;
  lines?: SalesHistoryLine[];
  paymentDetails?: PaymentDetail[];
}

interface SalesDetail {
  orderNo?: string;
  invoiceNo?: string;
  customerName?: string;
  dateCreated?: string;
  invoiceAmount?: number;
  salesRepName?: string;
  lines?: SalesHistoryLine[];
  paymentDetails?: PaymentDetail[];
  [key: string]: unknown;
}

interface InvoiceItem {
  invoiceNo?: string;
  customerName?: string;
  dateCreated?: string;
  invoiceAmount?: number;
  dueDate?: string;
  [key: string]: unknown;
}

interface OpenInvoiceItem {
  invoiceNo?: string;
  customerName?: string;
  invoiceAmount?: number;
  dueDate?: string;
  openAmount?: number;
  [key: string]: unknown;
}

/**
 * Register all 6 orders/billing MCP tools on the provided McpServer instance.
 *
 * Tools registered:
 *   ORD-01  list_orders             -- sales history from POSibolt
 *   ORD-02  get_order               -- single order by orderNo
 *   ORD-03  list_invoices           -- previous invoices from POSibolt
 *   ORD-04  get_invoice             -- single invoice by invoiceNo
 *   ORD-05  list_overdue_invoices   -- open/unpaid invoices for a customer
 *   ORD-06  get_payment_summary     -- aggregate payment totals from sales history
 *
 * All tools call the POSibolt REST API via pbGet. No local database access.
 */
export function registerOrdersTools(server: McpServer, filter?: Set<string> | null): void {
  // -------------------------------------------------------------------------
  // ORD-01: list_orders -- sales history with date range and optional filters
  // -------------------------------------------------------------------------
  if (shouldRegister('list_orders', filter)) server.tool(
    'list_orders',
    'List sales orders from POSibolt. Defaults to last 30 days. Optionally filter by customerId or orgId. Returns order summaries with line items and payment details.',
    {
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Start date inclusive (YYYY-MM-DD). Default: 30 days ago.'),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('End date inclusive (YYYY-MM-DD). Default: today.'),
      customerId: z.number().int().optional()
        .describe('POSibolt customer ID to filter by.'),
      orgId: z.number().int().optional()
        .describe('POSibolt organization ID to filter by.'),
      includeCRO: z.boolean().optional()
        .describe('Include CRO orders. Default: true.'),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    withAudit('list_orders', async ({ fromDate, toDate, customerId, orgId, includeCRO, limit = 200, offset = 0 }) => {
      try {
        const config = getErpConfig();

        const from = fromDate ?? fmtDate(defaultFromDate());
        const to = toDate ?? fmtDate(new Date());

        const params: Record<string, string | number | boolean> = {
          fromDate: from,
          toDate: to,
          limit,
          offset,
          includeCRO: includeCRO ?? true,
        };
        if (customerId !== undefined) params.customerId = customerId;
        if (orgId !== undefined) params.orgId = orgId;

        const endpoint = await getToolEndpoint('list_orders', '/salesorder/saleshistory');
        const items = await pbGet<SalesHistoryItem[]>(
          config,
          endpoint,
          params,
        );

        return toolSuccess({
          items,
          total_count: items.length,
          filter: { fromDate: from, toDate: to, customerId, orgId },
        });
      } catch (err) {
        logger.error({ err }, 'list_orders error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // ORD-02: get_order -- single order by orderNo
  // -------------------------------------------------------------------------
  if (shouldRegister('get_order', filter)) server.tool(
    'get_order',
    'Get full details for a single sales order by its order number (e.g. "SOKK-57102"). Returns line items, payment details, and customer info.',
    {
      orderNo: z.string().min(1).describe('POSibolt order number (e.g. "SOKK-57102").'),
    },
    withAudit('get_order', async ({ orderNo }) => {
      try {
        const config = getErpConfig();

        const endpoint = await getToolEndpoint('get_order', '/salesorder/getsalesdetails');
        const result = await pbGet<SalesDetail | SalesDetail[]>(
          config,
          endpoint,
          { orderNo },
        );

        // API may return a single object or an array; normalise
        const order = Array.isArray(result) ? result[0] : result;

        if (!order) {
          return toolError('NOT_FOUND', `Order ${orderNo} not found`);
        }

        return toolSuccess(order);
      } catch (err) {
        logger.error({ err }, 'get_order error');
        if (err instanceof Error && err.message.includes('404')) {
          return toolError('NOT_FOUND', `Order ${orderNo} not found`);
        }
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // ORD-03: list_invoices -- previous invoices with date range
  // -------------------------------------------------------------------------
  if (shouldRegister('list_invoices', filter)) server.tool(
    'list_invoices',
    'List previous invoices from POSibolt. Defaults to last 30 days. Optionally filter by customerId.',
    {
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Start date inclusive (YYYY-MM-DD). Default: 30 days ago.'),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('End date inclusive (YYYY-MM-DD). Default: today.'),
      customerId: z.number().int().optional()
        .describe('POSibolt customer ID to filter by.'),
    },
    withAudit('list_invoices', async ({ fromDate, toDate, customerId }) => {
      try {
        const config = getErpConfig();

        // This endpoint expects epoch milliseconds for date parameters
        const fromMs = fromDate
          ? new Date(fromDate).getTime()
          : defaultFromDate().getTime();
        const toMs = toDate
          ? new Date(toDate).getTime()
          : Date.now();

        const params: Record<string, string | number | boolean> = {
          fromDate: fromMs,
          toDate: toMs,
        };
        if (customerId !== undefined) params.customerId = customerId;

        const endpoint = await getToolEndpoint('list_invoices', '/salesinvoice/getPreviousInvoices');
        const items = await pbGet<InvoiceItem[]>(
          config,
          endpoint,
          params,
        );

        return toolSuccess({
          items,
          total_count: items.length,
          filter: {
            fromDate: fromDate ?? fmtDate(defaultFromDate()),
            toDate: toDate ?? fmtDate(new Date()),
            customerId,
          },
        });
      } catch (err) {
        logger.error({ err }, 'list_invoices error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // ORD-04: get_invoice -- single invoice by invoiceNo
  // -------------------------------------------------------------------------
  if (shouldRegister('get_invoice', filter)) server.tool(
    'get_invoice',
    'Get full details for a single invoice by its invoice number (e.g. "SIKK-105829"). Returns line items, payment details, and customer info.',
    {
      invoiceNo: z.string().min(1).describe('POSibolt invoice number (e.g. "SIKK-105829").'),
    },
    withAudit('get_invoice', async ({ invoiceNo }) => {
      try {
        const config = getErpConfig();

        const endpoint = await getToolEndpoint('get_invoice', '/salesorder/getsalesdetails');
        const result = await pbGet<SalesDetail | SalesDetail[]>(
          config,
          endpoint,
          { invoiceNo },
        );

        // API may return a single object or an array; normalise
        const invoice = Array.isArray(result) ? result[0] : result;

        if (!invoice) {
          return toolError('NOT_FOUND', `Invoice ${invoiceNo} not found`);
        }

        return toolSuccess(invoice);
      } catch (err) {
        logger.error({ err }, 'get_invoice error');
        if (err instanceof Error && err.message.includes('404')) {
          return toolError('NOT_FOUND', `Invoice ${invoiceNo} not found`);
        }
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // ORD-05: list_overdue_invoices -- open/unpaid invoices for a customer
  // -------------------------------------------------------------------------
  if (shouldRegister('list_overdue_invoices', filter)) server.tool(
    'list_overdue_invoices',
    'List all open (unpaid) invoices for a specific customer from POSibolt. Requires a customerId.',
    {
      customerId: z.number().int().describe('POSibolt customer ID (required).'),
    },
    withAudit('list_overdue_invoices', async ({ customerId }) => {
      try {
        const config = getErpConfig();

        const endpoint = await getToolEndpoint('list_overdue_invoices', '/customermaster/getCustomerOpenInvoices');
        const items = await pbGet<OpenInvoiceItem[]>(
          config,
          endpoint,
          { customerId },
        );

        // Compute total open amount across all unpaid invoices
        const totalOpen = items.reduce(
          (sum, inv) => sum + (inv.openAmount ?? inv.invoiceAmount ?? 0),
          0,
        );

        return toolSuccess({
          items,
          total_count: items.length,
          total_open_amount: totalOpen,
          customerId,
        });
      } catch (err) {
        logger.error({ err }, 'list_overdue_invoices error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // ORD-06: get_payment_summary -- aggregate payment totals from sales history
  // -------------------------------------------------------------------------
  if (shouldRegister('get_payment_summary', filter)) server.tool(
    'get_payment_summary',
    'Get a payment summary for a date range: total invoiced amount, total from payment details, and order count. Defaults to last 30 days.',
    {
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Start date inclusive (YYYY-MM-DD). Default: 30 days ago.'),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('End date inclusive (YYYY-MM-DD). Default: today.'),
      customerId: z.number().int().optional()
        .describe('POSibolt customer ID to filter by.'),
    },
    withAudit('get_payment_summary', async ({ fromDate, toDate, customerId }) => {
      try {
        const config = getErpConfig();

        const from = fromDate ?? fmtDate(defaultFromDate());
        const to = toDate ?? fmtDate(new Date());

        const params: Record<string, string | number | boolean> = {
          fromDate: from,
          toDate: to,
          limit: 10000,
          offset: 0,
          includeCRO: true,
        };
        if (customerId !== undefined) params.customerId = customerId;

        const endpoint = await getToolEndpoint('get_payment_summary', '/salesorder/saleshistory');
        const items = await pbGet<SalesHistoryItem[]>(
          config,
          endpoint,
          params,
        );

        // Aggregate totals from the sales history
        let totalInvoiced = 0;
        let totalPayments = 0;
        let orderCount = 0;

        for (const item of items) {
          orderCount++;
          totalInvoiced += item.invoiceAmount ?? 0;

          if (item.paymentDetails) {
            for (const pd of item.paymentDetails) {
              totalPayments += pd.amount ?? 0;
            }
          }
        }

        const outstandingBalance = totalInvoiced - totalPayments;

        return toolSuccess({
          total_invoiced: totalInvoiced.toFixed(2),
          total_payments: totalPayments.toFixed(2),
          outstanding_balance: outstandingBalance.toFixed(2),
          order_count: orderCount,
          filter: { fromDate: from, toDate: to, customerId },
        });
      } catch (err) {
        logger.error({ err }, 'get_payment_summary error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );
}
