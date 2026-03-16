-- Migration 000004 rollback: drop ERP tables in reverse FK dependency order
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS order_line_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS stock_levels;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS products;
