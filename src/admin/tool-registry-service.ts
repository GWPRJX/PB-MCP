import postgres from 'postgres';
import { logger } from '../logger.js';

/**
 * Tool definition as stored in the tool_registry table.
 */
export interface ToolRegistryEntry {
  id: string;
  toolName: string;
  displayName: string;
  description: string | null;
  category: string;
  source: 'builtin' | 'youtrack' | 'uploaded';
  sourceDocId: string | null;
  isActive: boolean;
  parameters: unknown | null;
  createdAt: string;
  updatedAt: string;
}

/** Canonical list of all 27 builtin tools with metadata. */
const BUILTIN_TOOLS: Array<{ toolName: string; displayName: string; description: string; category: string }> = [
  // Inventory (7)
  { toolName: 'list_products',      displayName: 'List Products',       description: 'List products with pagination and optional filters',       category: 'inventory' },
  { toolName: 'get_product',        displayName: 'Get Product',         description: 'Get detailed product information by SKU or search query',  category: 'inventory' },
  { toolName: 'list_stock_levels',  displayName: 'List Stock Levels',   description: 'List current stock levels across warehouses',              category: 'inventory' },
  { toolName: 'get_stock_level',    displayName: 'Get Stock Level',     description: 'Get stock level for a specific product',                  category: 'inventory' },
  { toolName: 'list_low_stock',     displayName: 'List Low Stock',      description: 'List products below their reorder point',                 category: 'inventory' },
  { toolName: 'list_suppliers',     displayName: 'List Suppliers',      description: 'List all suppliers/vendors',                              category: 'inventory' },
  { toolName: 'get_supplier',       displayName: 'Get Supplier',        description: 'Get detailed supplier information',                       category: 'inventory' },
  // Orders (6)
  { toolName: 'list_orders',           displayName: 'List Orders',          description: 'List sales orders with date range and status filters',    category: 'orders' },
  { toolName: 'get_order',             displayName: 'Get Order',            description: 'Get detailed order with line items',                      category: 'orders' },
  { toolName: 'list_invoices',         displayName: 'List Invoices',        description: 'List invoices with date range and status filters',        category: 'orders' },
  { toolName: 'get_invoice',           displayName: 'Get Invoice',          description: 'Get detailed invoice information',                        category: 'orders' },
  { toolName: 'list_overdue_invoices', displayName: 'List Overdue Invoices',description: 'List all invoices past their due date',                   category: 'orders' },
  { toolName: 'get_payment_summary',   displayName: 'Get Payment Summary',  description: 'Get aggregate payment totals from sales history',        category: 'orders' },
  // CRM (5)
  { toolName: 'list_contacts',        displayName: 'List Contacts',        description: 'List business partners with pagination',                 category: 'crm' },
  { toolName: 'search_contacts',      displayName: 'Search Contacts',      description: 'Search contacts by name or email',                       category: 'crm' },
  { toolName: 'get_contact',          displayName: 'Get Contact',          description: 'Get detailed contact information by ID',                  category: 'crm' },
  { toolName: 'get_contact_orders',   displayName: 'Get Contact Orders',   description: 'List orders for a specific contact',                     category: 'crm' },
  { toolName: 'get_contact_invoices', displayName: 'Get Contact Invoices', description: 'List invoices for a specific contact',                   category: 'crm' },
  // KB (3)
  { toolName: 'search_kb',          displayName: 'Search KB',           description: 'Search knowledge base articles by keyword',               category: 'kb' },
  { toolName: 'get_kb_article',     displayName: 'Get KB Article',      description: 'Get a specific knowledge base article by ID',             category: 'kb' },
  { toolName: 'get_kb_sync_status', displayName: 'Get KB Sync Status',  description: 'Get the current KB sync status and article count',        category: 'kb' },
  // Write (6)
  { toolName: 'create_stock_entry', displayName: 'Create Stock Entry',  description: 'Create a new stock entry / inventory movement',           category: 'write' },
  { toolName: 'update_stock_entry', displayName: 'Update Stock Entry',  description: 'Update an existing stock entry',                          category: 'write' },
  { toolName: 'create_invoice',     displayName: 'Create Invoice',      description: 'Create an invoice from an existing order',                category: 'write' },
  { toolName: 'update_invoice',     displayName: 'Update Invoice',      description: 'Update an existing invoice (e.g. mark as paid)',          category: 'write' },
  { toolName: 'create_contact',     displayName: 'Create Contact',      description: 'Create a new business partner/contact',                   category: 'write' },
  { toolName: 'update_contact',     displayName: 'Update Contact',      description: 'Update an existing business partner/contact',             category: 'write' },
];

/**
 * Ensures all 27 builtin tools exist in the tool_registry table.
 * Called on server startup. Uses INSERT ... ON CONFLICT DO NOTHING
 * so existing entries (including doc-sourced overrides) are preserved.
 */
export async function syncBuiltinTools(sql: postgres.Sql): Promise<void> {
  const currentNames = BUILTIN_TOOLS.map((t) => t.toolName);
  for (const tool of BUILTIN_TOOLS) {
    await sql`
      INSERT INTO tool_registry (tool_name, display_name, description, category, source)
      VALUES (${tool.toolName}, ${tool.displayName}, ${tool.description}, ${tool.category}, 'builtin')
      ON CONFLICT (tool_name) DO NOTHING
    `;
  }
  // Deactivate stale builtin entries no longer in the canonical list
  await sql`
    UPDATE tool_registry SET is_active = false
    WHERE source = 'builtin' AND tool_name != ALL(${currentNames})
  `;
  logger.info({ count: BUILTIN_TOOLS.length }, 'Builtin tools synced to registry');
}

/**
 * Returns all tools from the registry (builtin + doc-sourced).
 */
export async function getRegisteredTools(sql: postgres.Sql): Promise<ToolRegistryEntry[]> {
  const rows = await sql`
    SELECT id, tool_name, display_name, description, category, source,
           source_doc_id, is_active, parameters, created_at, updated_at
    FROM tool_registry
    ORDER BY category, tool_name
  `;
  return rows.map((r) => ({
    id: r.id,
    toolName: r.tool_name,
    displayName: r.display_name,
    description: r.description,
    category: r.category,
    source: r.source,
    sourceDocId: r.source_doc_id,
    isActive: r.is_active,
    parameters: r.parameters,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Returns just the tool names of all active tools in the registry.
 * Used by tool-permissions-service to replace hardcoded ALL_TOOLS.
 */
export async function getActiveToolNames(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql`
    SELECT tool_name FROM tool_registry WHERE is_active = true ORDER BY tool_name
  `;
  return rows.map((r) => r.tool_name);
}

/**
 * Toggles the is_active flag for a tool in the registry.
 * Returns the new active state, or null if the tool was not found.
 */
export async function toggleToolActive(sql: postgres.Sql, toolName: string): Promise<boolean | null> {
  const rows = await sql`
    UPDATE tool_registry
    SET is_active = NOT is_active, updated_at = now()
    WHERE tool_name = ${toolName}
    RETURNING is_active
  `;
  if (rows.length === 0) return null;
  return rows[0].is_active;
}

/**
 * Registers a tool discovered from a KB document.
 * If the tool_name already exists, updates description and source metadata.
 */
export async function registerToolFromDoc(
  sql: postgres.Sql,
  toolDef: { toolName: string; displayName: string; description: string; category: string; sourceDocId: string; source: 'youtrack' | 'uploaded' },
): Promise<void> {
  await sql`
    INSERT INTO tool_registry (tool_name, display_name, description, category, source, source_doc_id)
    VALUES (${toolDef.toolName}, ${toolDef.displayName}, ${toolDef.description}, ${toolDef.category}, ${toolDef.source}, ${toolDef.sourceDocId})
    ON CONFLICT (tool_name) DO UPDATE SET
      display_name = CASE WHEN tool_registry.source = 'builtin' THEN tool_registry.display_name ELSE EXCLUDED.display_name END,
      description = EXCLUDED.description,
      source_doc_id = EXCLUDED.source_doc_id,
      updated_at = now()
  `;
  logger.info({ toolName: toolDef.toolName, source: toolDef.source }, 'Tool registered from doc');
}
