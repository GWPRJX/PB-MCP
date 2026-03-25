-- Tool registry: catalog of all MCP tools (builtin + doc-sourced)
CREATE TABLE IF NOT EXISTS tool_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  source TEXT NOT NULL DEFAULT 'builtin',  -- 'builtin' | 'youtrack' | 'uploaded'
  source_doc_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed all 27 builtin tools
INSERT INTO tool_registry (tool_name, display_name, description, category, source) VALUES
  -- Inventory (7)
  ('list_products',     'List Products',       'List products with pagination and optional filters',         'inventory', 'builtin'),
  ('get_product',       'Get Product',         'Get detailed product information by SKU or search query',    'inventory', 'builtin'),
  ('list_stock_levels', 'List Stock Levels',   'List current stock levels across warehouses',                'inventory', 'builtin'),
  ('get_stock_level',   'Get Stock Level',     'Get stock level for a specific product',                    'inventory', 'builtin'),
  ('list_low_stock',    'List Low Stock',      'List products below their reorder point',                   'inventory', 'builtin'),
  ('list_suppliers',    'List Suppliers',      'List all suppliers/vendors',                                'inventory', 'builtin'),
  ('get_supplier',      'Get Supplier',        'Get detailed supplier information',                         'inventory', 'builtin'),
  -- Orders (6)
  ('list_orders',          'List Orders',          'List sales orders with date range and status filters',      'orders', 'builtin'),
  ('get_order',            'Get Order',            'Get detailed order with line items',                        'orders', 'builtin'),
  ('list_invoices',        'List Invoices',        'List invoices with date range and status filters',          'orders', 'builtin'),
  ('get_invoice',          'Get Invoice',          'Get detailed invoice information',                          'orders', 'builtin'),
  ('list_overdue_invoices','List Overdue Invoices','List all invoices past their due date',                     'orders', 'builtin'),
  ('get_overdue_summary',  'Get Overdue Summary',  'Get summary of overdue invoices with aging buckets',       'orders', 'builtin'),
  -- CRM (5)
  ('list_contacts',        'List Contacts',        'List business partners with pagination',                   'crm', 'builtin'),
  ('search_contacts',      'Search Contacts',      'Search contacts by name or email',                         'crm', 'builtin'),
  ('get_contact',          'Get Contact',          'Get detailed contact information by ID',                    'crm', 'builtin'),
  ('get_contact_orders',   'Get Contact Orders',   'List orders for a specific contact',                       'crm', 'builtin'),
  ('get_contact_invoices', 'Get Contact Invoices', 'List invoices for a specific contact',                     'crm', 'builtin'),
  -- KB (3)
  ('search_kb',         'Search KB',           'Search knowledge base articles by keyword',                 'kb', 'builtin'),
  ('get_kb_article',    'Get KB Article',      'Get a specific knowledge base article by ID',               'kb', 'builtin'),
  ('get_kb_sync_status','Get KB Sync Status',  'Get the current KB sync status and article count',          'kb', 'builtin'),
  -- Write (6)
  ('transfer_stock',    'Transfer Stock',      'Create a stock transfer between warehouses',                'write', 'builtin'),
  ('create_order',      'Create Order',        'Create a new sales order',                                  'write', 'builtin'),
  ('create_invoice',    'Create Invoice',      'Create an invoice from an existing order',                  'write', 'builtin'),
  ('mark_invoice_paid', 'Mark Invoice Paid',   'Mark an invoice as paid',                                   'write', 'builtin'),
  ('update_order_status','Update Order Status', 'Update the status of an existing order',                   'write', 'builtin'),
  ('create_contact',    'Create Contact',      'Create a new business partner/contact',                     'write', 'builtin')
ON CONFLICT (tool_name) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON tool_registry TO app_user;
