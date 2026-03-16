-- Migration 000004: Create all 7 tenant-bearing ERP tables
-- All tables use ENABLE + FORCE ROW LEVEL SECURITY with tenant_isolation policy.
-- Creation order respects FK dependencies:
--   products → stock_levels
--   contacts → orders → order_line_items
--   contacts + orders → invoices

-- ============================================================
-- products
-- ============================================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'USD',
    category        TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    reorder_point   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_tenant_sku_unique UNIQUE (tenant_id, sku)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON products
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_user;

-- ============================================================
-- stock_levels
-- ============================================================
CREATE TABLE stock_levels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand    INTEGER NOT NULL DEFAULT 0,
    warehouse_location  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON stock_levels
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON stock_levels TO app_user;

-- ============================================================
-- suppliers
-- ============================================================
CREATE TABLE suppliers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    address     TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON suppliers
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO app_user;

-- ============================================================
-- contacts
-- ============================================================
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    company         TEXT,
    type            TEXT DEFAULT 'customer',
    tags            TEXT[] DEFAULT '{}',
    notes           TEXT,
    last_contact_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contacts_tenant_email_unique UNIQUE (tenant_id, email)
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON contacts
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO app_user;

-- ============================================================
-- orders
-- ============================================================
CREATE TABLE orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','confirmed','shipped','delivered','cancelled')),
    order_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    notes       TEXT,
    subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total       NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO app_user;

-- ============================================================
-- order_line_items
-- ============================================================
CREATE TABLE order_line_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(12,2) NOT NULL,
    line_total  NUMERIC(12,2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON order_line_items
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON order_line_items TO app_user;

-- ============================================================
-- invoices
-- ============================================================
CREATE TABLE invoices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
    contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
    issued_at   DATE,
    due_at      DATE,
    paid_at     TIMESTAMPTZ,
    subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total       NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON invoices
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_user;

-- ============================================================
-- Bulk sequence grant (needed for INSERT on UUID-default tables
-- that may reference sequences in the public schema)
-- ============================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
