import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register pre-built prompt templates for common ERP workflows.
 * Prompts guide AI clients through multi-step operations using available tools.
 */
export function registerPrompts(server: McpServer): void {
  server.prompt(
    'inventory_report',
    'Generate a comprehensive inventory status report',
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Generate an inventory status report. Use list_products to get the full product catalog, list_low_stock to find items needing reorder, and list_stock_levels for warehouse quantities. Summarize findings with counts, highlight critical low-stock items, and suggest reorder actions.',
        },
      }],
    })
  );

  server.prompt(
    'overdue_followup',
    'Draft follow-up communications for overdue invoices',
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Find all overdue invoices using list_overdue_invoices. For each overdue invoice, use get_contact to look up the customer details. Draft professional follow-up emails for each overdue account, prioritized by amount and days overdue.',
        },
      }],
    })
  );

  server.prompt(
    'order_lookup',
    "Look up a customer's complete order and invoice history",
    { customer_name: z.string().max(200).describe('Customer name to search for') },
    async ({ customer_name }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Look up the complete history for customer "${customer_name}". Use search_contacts to find the customer, then get_contact_orders for their orders and get_contact_invoices for their invoices. Provide a comprehensive summary of their account activity.`,
        },
      }],
    })
  );

  server.prompt(
    'stock_reorder',
    'Check low stock and create reorder entries (involves write operations)',
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Check current stock levels using list_low_stock to identify items below reorder point. For each item needing reorder, use create_stock_entry to create a reorder entry. Summarize all reorder actions taken.',
        },
      }],
    })
  );

  server.prompt(
    'new_customer_onboard',
    'Set up a new customer in the system (involves write operations)',
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Help set up a new customer. Ask for the customer details (name, email, phone, company), then use create_contact to create the customer record. If the customer has an initial order, use create_invoice to generate their first invoice.',
        },
      }],
    })
  );

  server.prompt(
    'kb_research',
    'Research a topic using the knowledge base',
    { topic: z.string().max(200).describe('Topic or keywords to research') },
    async ({ topic }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Research the topic "${topic}" using the knowledge base. Use search_kb to find relevant articles, then use get_kb_article to read the full content of the most relevant results. Provide a comprehensive summary of findings.`,
        },
      }],
    })
  );
}
