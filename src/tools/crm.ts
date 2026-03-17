import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import postgres from 'postgres';
import { z } from 'zod';
import { getTenantId } from '../context.js';
import { withTenantContext } from '../db/client.js';
import { toolError, toolSuccess } from './errors.js';

/**
 * Register all 5 CRM MCP tools on the provided McpServer instance.
 *
 * Tools registered:
 *   CRM-01  list_contacts          — paginated contacts with optional type filter
 *   CRM-02  get_contact            — single contact by ID
 *   CRM-03  search_contacts        — ILIKE search across name, email, company
 *   CRM-04  get_contact_orders     — order summaries for a contact
 *   CRM-05  get_contact_invoices   — invoice summaries + outstanding balance for a contact
 *
 * CRITICAL: All queries use raw txSql inside withTenantContext — NOT the db Drizzle export.
 * The Drizzle db instance does not execute within the tenant transaction context.
 */
export function registerCrmTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // CRM-01: list_contacts — paginated contacts with optional type filter
  // -------------------------------------------------------------------------
  server.tool(
    'list_contacts',
    'List all contacts for the tenant with pagination. Optionally filter by type (e.g., customer, vendor, lead).',
    {
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
      type: z.string().optional(),
    },
    async ({ limit = 200, offset = 0, type }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          const [{ count }] = type
            ? await txSql`SELECT COUNT(*) AS count FROM contacts WHERE type = ${type}` as [{ count: string }]
            : await txSql`SELECT COUNT(*) AS count FROM contacts` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = type
            ? await txSql`
                SELECT id, name, email, phone, company, type, tags, last_contact_at, created_at
                FROM contacts
                WHERE type = ${type}
                ORDER BY name ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            : await txSql`
                SELECT id, name, email, phone, company, type, tags, last_contact_at, created_at
                FROM contacts
                ORDER BY name ASC
                LIMIT ${limit} OFFSET ${offset}
              `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/crm] list_contacts error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // CRM-02: get_contact — single contact by ID
  // -------------------------------------------------------------------------
  server.tool(
    'get_contact',
    'Get full details for a single contact by its UUID.',
    {
      id: z.string().uuid(),
    },
    async ({ id }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const rows = await txSql`
            SELECT id, tenant_id, name, email, phone, company, type, tags, notes, last_contact_at, created_at, updated_at
            FROM contacts
            WHERE id = ${id}
          `;
          return rows[0] ?? null;
        });
        if (!result) {
          return toolError('NOT_FOUND', 'Contact not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/crm] get_contact error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // CRM-03: search_contacts — ILIKE search across name, email, company
  // Template literal interpolation of %query% is a parameterized bind in postgres.js
  // -------------------------------------------------------------------------
  server.tool(
    'search_contacts',
    'Search contacts using a case-insensitive text query matched against name, email, and company fields.',
    {
      query: z.string().min(1),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ query, limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;
          const pattern = `%${query}%`;

          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count
            FROM contacts
            WHERE name ILIKE ${pattern}
               OR email ILIKE ${pattern}
               OR company ILIKE ${pattern}
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT id, name, email, phone, company, type, tags, last_contact_at, created_at
            FROM contacts
            WHERE name ILIKE ${pattern}
               OR email ILIKE ${pattern}
               OR company ILIKE ${pattern}
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/crm] search_contacts error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // CRM-04: get_contact_orders — order summaries for a contact
  // Check contact exists first, then return order summaries
  // -------------------------------------------------------------------------
  server.tool(
    'get_contact_orders',
    'Get a paginated list of order summaries for a specific contact. Returns NOT_FOUND if the contact does not exist.',
    {
      contact_id: z.string().uuid(),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ contact_id, limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          // Check contact exists (RLS scopes to this tenant)
          const contactRows = await txSql`SELECT id FROM contacts WHERE id = ${contact_id}`;
          if (contactRows.length === 0) return null;

          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count FROM orders WHERE contact_id = ${contact_id}
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT id, order_date, status, total
            FROM orders
            WHERE contact_id = ${contact_id}
            ORDER BY order_date DESC, created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor };
        });

        if (!result) {
          return toolError('NOT_FOUND', 'Contact not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/crm] get_contact_orders error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // -------------------------------------------------------------------------
  // CRM-05: get_contact_invoices — invoice summaries + outstanding balance for a contact
  // outstanding_balance = SUM(total) WHERE status NOT IN ('paid', 'cancelled')
  // Check contact exists first, then return invoice summaries + balance
  // -------------------------------------------------------------------------
  server.tool(
    'get_contact_invoices',
    'Get a paginated list of invoice summaries plus outstanding balance for a specific contact. Returns NOT_FOUND if the contact does not exist.',
    {
      contact_id: z.string().uuid(),
      limit: z.number().int().min(1).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ contact_id, limit = 200, offset = 0 }) => {
      try {
        const tenantId = getTenantId();
        const result = await withTenantContext(tenantId, async (tx) => {
          const txSql = tx as unknown as postgres.Sql;

          // Check contact exists (RLS scopes to this tenant)
          const contactRows = await txSql`SELECT id FROM contacts WHERE id = ${contact_id}`;
          if (contactRows.length === 0) return null;

          const [{ count }] = await txSql`
            SELECT COUNT(*) AS count FROM invoices WHERE contact_id = ${contact_id}
          ` as [{ count: string }];
          const totalCount = parseInt(count, 10);

          const items = await txSql`
            SELECT id, issued_at, due_at, status, total, paid_at
            FROM invoices
            WHERE contact_id = ${contact_id}
            ORDER BY issued_at DESC, created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

          const [{ outstanding_balance }] = await txSql`
            SELECT COALESCE(SUM(total), 0)::text AS outstanding_balance
            FROM invoices
            WHERE contact_id = ${contact_id}
              AND status NOT IN ('paid', 'cancelled')
          ` as [{ outstanding_balance: string }];

          const nextCursor = offset + items.length < totalCount ? offset + limit : null;
          return { items, total_count: totalCount, next_cursor: nextCursor, outstanding_balance };
        });

        if (!result) {
          return toolError('NOT_FOUND', 'Contact not found');
        }
        return toolSuccess(result);
      } catch (err) {
        process.stderr.write(`[tools/crm] get_contact_invoices error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );
}
