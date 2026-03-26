/**
 * MCP write tools for POSibolt ERP.
 *
 * 6 write tools for stock management, invoicing, and contact management.
 * All tools use withAudit for audit logging, shouldRegister for access control,
 * and never throw from handlers.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pbPost } from '../posibolt/client.js';
import { getErpConfig } from '../context.js';
import { shouldRegister, withAudit, toolSuccess, toolError } from './errors.js';
import { logger } from '../logger.js';
import { getToolEndpoint } from './config.js';

/**
 * Convert an ISO date string (YYYY-MM-DD) to POSibolt format (dd-MM-yyyy).
 * Falls back to today's date if no input is provided.
 */
function toPosiDate(isoDate?: string): string {
  if (!isoDate) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Register all 6 write MCP tools on the provided McpServer instance.
 *
 * Tools registered (backed by POSibolt REST API):
 *   WRITE-01  create_stock_entry  -- stock transfer request via /stocktransferrequest
 *   WRITE-02  update_stock_entry  -- complete stock transfer via /stocktransfer/completestocktransfer
 *   WRITE-03  create_invoice      -- sales order + invoice via /salesinvoice/createorderinvoice
 *   WRITE-04  update_invoice      -- cancel order via /salesorder/cancelorder
 *   WRITE-05  create_contact      -- create business partner via /customermaster
 *   WRITE-06  update_contact      -- update business partner via /customermaster/{id}
 */
export function registerWriteTools(server: McpServer, filter?: Set<string> | null): void {
  // -------------------------------------------------------------------------
  // WRITE-01: create_stock_entry -- create stock transfer request
  // -------------------------------------------------------------------------
  if (shouldRegister('create_stock_entry', filter)) server.tool(
    'create_stock_entry',
    'Create a stock transfer request to move inventory between warehouses in POSibolt',
    {
      fromWarehouseId: z.number().int().describe('Source warehouse ID'),
      toWarehouseId: z.number().int().describe('Destination warehouse ID'),
      dateRequired: z.string().optional().describe('Required date in YYYY-MM-DD format (defaults to today)'),
      lines: z.array(z.object({
        productId: z.number().int().describe('Product ID'),
        qty: z.number().positive().describe('Quantity to transfer'),
        uom: z.string().default('Each').describe('Unit of measure'),
        sku: z.string().optional().describe('Product SKU'),
        productName: z.string().optional().describe('Product name'),
      })).min(1).describe('Line items to transfer'),
    },
    withAudit('create_stock_entry', async (params) => {
      try {
        const config = getErpConfig();
        const formattedDate = toPosiDate(params.dateRequired);
        const body = {
          dateFormat: 'dd-MM-yyyy',
          dateRequired: formattedDate,
          fromWarehouseId: params.fromWarehouseId,
          toWarehouseId: params.toWarehouseId,
          lines: params.lines.map((l: { productId: number; qty: number; uom?: string; sku?: string; productName?: string }) => ({
            moveAllQty: false,
            productId: l.productId,
            qty: l.qty,
            reqQty: l.qty,
            uom: l.uom ?? 'Each',
            sku: l.sku ?? '',
            productName: l.productName ?? '',
            upc: '',
            warehouseId: 0,
          })),
        };
        const endpoint = await getToolEndpoint('create_stock_entry', '/stocktransferrequest');
        const result = await pbPost(config, endpoint, body);
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'create_stock_entry error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE-02: update_stock_entry -- complete a stock transfer
  // -------------------------------------------------------------------------
  if (shouldRegister('update_stock_entry', filter)) server.tool(
    'update_stock_entry',
    'Complete a stock transfer in POSibolt — finalizes a pending transfer between warehouses',
    {
      toWarehouseId: z.number().int().describe('Destination warehouse ID'),
      transferDate: z.string().optional().describe('Transfer date in YYYY-MM-DD (defaults to today)'),
      stockTransferId: z.number().int().default(0).describe('Existing stock transfer ID (0 for new spot transfer)'),
      comments: z.string().optional().describe('Transfer comments'),
      issuedBy: z.string().optional().describe('Who issued the transfer'),
      lines: z.array(z.object({
        productId: z.number().int().describe('Product ID'),
        qty: z.number().positive().describe('Quantity'),
        uom: z.string().default('Each').describe('Unit of measure'),
        uomId: z.number().int().default(100).describe('UOM ID (100 = Each)'),
        movementLineId: z.number().int().default(0),
        requisitionLineId: z.number().int().default(0),
      })).min(1).describe('Transfer line items'),
    },
    withAudit('update_stock_entry', async (params) => {
      try {
        const config = getErpConfig();
        const formattedDate = toPosiDate(params.transferDate);
        const body = {
          comments: params.comments ?? '',
          issuedBy: params.issuedBy ?? '',
          toWarehouseId: params.toWarehouseId,
          transferDate: formattedDate,
          stockTransferId: params.stockTransferId ?? 0,
          lines: params.lines.map((l: { productId: number; qty: number; uom?: string; uomId?: number; movementLineId?: number; requisitionLineId?: number }) => ({
            movementLineId: l.movementLineId ?? 0,
            productId: l.productId,
            qty: l.qty,
            requisitionLineId: l.requisitionLineId ?? 0,
            uom: l.uom ?? 'Each',
            uomId: l.uomId ?? 100,
          })),
        };
        const endpoint = await getToolEndpoint('update_stock_entry', '/stocktransfer/completestocktransfer');
        const result = await pbPost(config, endpoint, body);
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'update_stock_entry error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE-03: create_invoice -- create sales order + invoice
  // -------------------------------------------------------------------------
  if (shouldRegister('create_invoice', filter)) server.tool(
    'create_invoice',
    'Create a sales invoice in POSibolt — generates both a sales order and invoice',
    {
      customerId: z.number().int().describe('Customer/business partner ID'),
      invoiceNo: z.string().describe('Invoice number/reference'),
      dateInvoiced: z.string().optional().describe('Invoice date YYYY-MM-DD (defaults to today)'),
      priceListId: z.number().int().describe('Price list ID'),
      warehouseId: z.number().int().describe('Warehouse ID'),
      paymentType: z.enum(['Cash', 'Credit', 'Card', 'Check']).default('Credit').describe('Payment type'),
      grandTotal: z.number().describe('Invoice grand total'),
      description: z.string().optional().describe('Invoice description'),
      roundOff: z.number().default(0).describe('Round-off amount'),
      discountAmt: z.number().default(0).describe('Discount amount'),
      salesRepId: z.number().int().optional().describe('Sales representative ID'),
      lines: z.array(z.object({
        productId: z.number().int().describe('Product ID'),
        qty: z.number().positive().describe('Quantity'),
        unitPrice: z.number().describe('Unit price'),
        uom: z.string().default('Each').describe('Unit of measure'),
        taxAmt: z.number().default(0).describe('Tax amount'),
        discountAmt: z.number().default(0).describe('Line discount'),
        discountPercentage: z.number().default(0).describe('Discount percentage'),
      })).min(1).describe('Invoice line items'),
      payments: z.array(z.object({
        amount: z.number().describe('Payment amount'),
        paymentType: z.string().describe('Payment method'),
        paymentNo: z.string().optional().describe('Payment reference number'),
      })).optional().describe('Payment details (auto-generated from grandTotal if not provided)'),
    },
    withAudit('create_invoice', async (params) => {
      try {
        const config = getErpConfig();
        const formattedDate = toPosiDate(params.dateInvoiced);

        const invoiceLineList = params.lines.map((l: { productId: number; qty: number; unitPrice: number; uom?: string; taxAmt?: number; discountAmt?: number; discountPercentage?: number }) => ({
          chargeId: 0,
          orderLineId: 0,
          isFreeItem: false,
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          uom: l.uom ?? 'Each',
          taxAmt: l.taxAmt ?? 0,
          discountAmt: l.discountAmt ?? 0,
          discountPercentage: l.discountPercentage ?? 0,
        }));

        const payments = params.payments
          ? params.payments.map((p: { amount: number; paymentType: string; paymentNo?: string }) => ({
              amount: p.amount,
              paymentType: p.paymentType,
              paymentNo: p.paymentNo ?? '',
              receipt: true,
              customerId: params.customerId,
              bpartnerType: 'customer',
              date: formattedDate,
              dateFormat: 'dd-MM-yyyy',
              description: '',
              discountAmt: 0,
            }))
          : [{
              amount: params.grandTotal,
              paymentType: params.paymentType,
              paymentNo: '',
              receipt: true,
              customerId: params.customerId,
              bpartnerType: 'customer',
              date: formattedDate,
              dateFormat: 'dd-MM-yyyy',
              description: '',
              discountAmt: 0,
            }];

        const body = {
          dateInvoiced: formattedDate,
          invoiceNo: params.invoiceNo,
          dateFormat: 'dd-MM-yyyy',
          customerId: params.customerId,
          priceListId: params.priceListId,
          paymentType: params.paymentType,
          grandTotal: params.grandTotal,
          warehouseId: params.warehouseId,
          description: params.description ?? '',
          roundOff: params.roundOff ?? 0,
          discountAmt: params.discountAmt ?? 0,
          salesRepId: params.salesRepId ?? 0,
          checkoutTime: Date.now(),
          invoiceLineList,
          payments,
        };
        const endpoint = await getToolEndpoint('create_invoice', '/salesinvoice/createorderinvoice');
        const result = await pbPost(config, endpoint, body);
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'create_invoice error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE-04: update_invoice -- cancel an existing order
  // -------------------------------------------------------------------------
  if (shouldRegister('update_invoice', filter)) server.tool(
    'update_invoice',
    'Cancel an existing sales order in POSibolt — completed invoices cannot be modified, only cancelled',
    {
      orderNo: z.string().describe('The order number to cancel'),
    },
    withAudit('update_invoice', async (params) => {
      try {
        const config = getErpConfig();
        const endpoint = await getToolEndpoint('update_invoice', '/salesorder/cancelorder');
        const result = await pbPost(config, endpoint, { orderNo: params.orderNo });
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'update_invoice error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE-05: create_contact -- create a new business partner
  // -------------------------------------------------------------------------
  if (shouldRegister('create_contact', filter)) server.tool(
    'create_contact',
    'Create a new business partner (customer or vendor) in POSibolt',
    {
      customerCode: z.string().describe('Unique customer/vendor code'),
      name: z.string().min(1).describe('Contact name'),
      region: z.string().describe('Region/State'),
      address1: z.string().describe('Primary address'),
      active: z.boolean().default(true).describe('Whether the contact is active'),
      customerGroup: z.string().optional().describe('Customer group name'),
      address2: z.string().optional().describe('Secondary address'),
      city: z.string().optional().describe('City'),
      country: z.string().optional().describe('Country'),
      postalCode: z.string().optional().describe('Postal/ZIP code'),
      email: z.string().optional().describe('Email address'),
      mobile: z.string().optional().describe('Mobile number'),
      phone: z.string().optional().describe('Phone number'),
      creditLimit: z.number().optional().describe('Credit limit'),
      pricelistId: z.number().int().optional().describe('Price list ID'),
    },
    withAudit('create_contact', async (params) => {
      try {
        const config = getErpConfig();
        const body: Record<string, unknown> = {
          action: 'create',
          customerCode: params.customerCode,
          name: params.name,
          region: params.region,
          address1: params.address1,
          active: params.active,
        };
        if (params.customerGroup !== undefined) body.customerGroup = params.customerGroup;
        if (params.address2 !== undefined) body.address2 = params.address2;
        if (params.city !== undefined) body.city = params.city;
        if (params.country !== undefined) body.country = params.country;
        if (params.postalCode !== undefined) body.postalCode = params.postalCode;
        if (params.email !== undefined) body.email = params.email;
        if (params.mobile !== undefined) body.mobile = params.mobile;
        if (params.phone !== undefined) body.phone = params.phone;
        if (params.creditLimit !== undefined) body.creditLimit = params.creditLimit;
        if (params.pricelistId !== undefined) body.pricelistId = params.pricelistId;

        const endpoint = await getToolEndpoint('create_contact', '/customermaster');
        const result = await pbPost(config, endpoint, body);
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'create_contact error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );

  // -------------------------------------------------------------------------
  // WRITE-06: update_contact -- update an existing business partner
  // -------------------------------------------------------------------------
  if (shouldRegister('update_contact', filter)) server.tool(
    'update_contact',
    'Update an existing business partner (customer or vendor) in POSibolt',
    {
      customerId: z.number().int().describe('The customer ID to update'),
      name: z.string().optional().describe('Updated name'),
      customerCode: z.string().optional().describe('Updated customer code'),
      region: z.string().optional().describe('Updated region'),
      address1: z.string().optional().describe('Updated primary address'),
      active: z.boolean().optional().describe('Active status'),
      customerGroup: z.string().optional().describe('Customer group'),
      address2: z.string().optional().describe('Secondary address'),
      city: z.string().optional().describe('City'),
      country: z.string().optional().describe('Country'),
      postalCode: z.string().optional().describe('Postal/ZIP code'),
      email: z.string().optional().describe('Email'),
      mobile: z.string().optional().describe('Mobile'),
      phone: z.string().optional().describe('Phone'),
      creditLimit: z.number().optional().describe('Credit limit'),
      pricelistId: z.number().int().optional().describe('Price list ID'),
      creditStatus: z.enum(['Credit Ok', 'No Credit Check', 'Credit Stop']).optional().describe('Credit status'),
    },
    withAudit('update_contact', async (params) => {
      try {
        const config = getErpConfig();
        const body: Record<string, unknown> = {
          action: 'update',
          customerId: params.customerId,
        };
        if (params.name !== undefined) body.name = params.name;
        if (params.customerCode !== undefined) body.customerCode = params.customerCode;
        if (params.region !== undefined) body.region = params.region;
        if (params.address1 !== undefined) body.address1 = params.address1;
        if (params.active !== undefined) body.active = params.active;
        if (params.customerGroup !== undefined) body.customerGroup = params.customerGroup;
        if (params.address2 !== undefined) body.address2 = params.address2;
        if (params.city !== undefined) body.city = params.city;
        if (params.country !== undefined) body.country = params.country;
        if (params.postalCode !== undefined) body.postalCode = params.postalCode;
        if (params.email !== undefined) body.email = params.email;
        if (params.mobile !== undefined) body.mobile = params.mobile;
        if (params.phone !== undefined) body.phone = params.phone;
        if (params.creditLimit !== undefined) body.creditLimit = params.creditLimit;
        if (params.pricelistId !== undefined) body.pricelistId = params.pricelistId;
        if (params.creditStatus !== undefined) body.creditStatus = params.creditStatus;

        const endpoint = await getToolEndpoint('update_contact', `/customermaster/${params.customerId}`);
        const result = await pbPost(config, endpoint, body);
        return toolSuccess(result);
      } catch (err) {
        logger.error({ err }, 'update_contact error');
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }),
  );
}
