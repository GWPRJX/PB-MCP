import postgres from 'postgres';
import { sql } from '../db/client.js';

export interface AuditEntry {
  id: string;
  toolName: string;
  keyId: string | null;
  params: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

/**
 * Record a tool call in the audit log.
 * Fire-and-forget — errors are logged to stderr but never thrown.
 */
export async function recordToolCall(
  tenantId: string,
  keyId: string,
  toolName: string,
  params: unknown,
  status: 'success' | 'error',
  errorMessage?: string,
  durationMs?: number
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;
      await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await txSql`
        INSERT INTO audit_log (tenant_id, key_id, tool_name, params, status, error_message, duration_ms)
        VALUES (${tenantId}, ${keyId}, ${toolName}, ${JSON.stringify(params ?? null)}::jsonb, ${status}, ${errorMessage ?? null}, ${durationMs ?? null})
      `;
    });
  } catch (err) {
    process.stderr.write(`[audit] ERROR recording tool call: ${(err as Error).message}\n`);
  }
}

/**
 * Query audit log for a tenant with pagination and optional filters.
 * Uses superuser connection (DATABASE_MIGRATION_URL) to bypass RLS for admin queries.
 */
export async function queryAuditLog(
  tenantId: string,
  opts: {
    limit?: number;
    offset?: number;
    toolName?: string;
    status?: string;
  } = {}
): Promise<{ entries: AuditEntry[]; totalCount: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const adminSql = postgres(process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '', { max: 2 });

  try {
    let rows: AuditEntry[];
    let countResult: { count: string }[];

    if (opts.toolName && opts.status) {
      rows = await adminSql<AuditEntry[]>`
        SELECT id, tool_name AS "toolName", key_id AS "keyId",
               params, status, error_message AS "errorMessage",
               duration_ms AS "durationMs", created_at AS "createdAt"
        FROM audit_log
        WHERE tenant_id = ${tenantId} AND tool_name = ${opts.toolName} AND status = ${opts.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await adminSql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM audit_log
        WHERE tenant_id = ${tenantId} AND tool_name = ${opts.toolName} AND status = ${opts.status}
      `;
    } else if (opts.toolName) {
      rows = await adminSql<AuditEntry[]>`
        SELECT id, tool_name AS "toolName", key_id AS "keyId",
               params, status, error_message AS "errorMessage",
               duration_ms AS "durationMs", created_at AS "createdAt"
        FROM audit_log
        WHERE tenant_id = ${tenantId} AND tool_name = ${opts.toolName}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await adminSql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM audit_log
        WHERE tenant_id = ${tenantId} AND tool_name = ${opts.toolName}
      `;
    } else if (opts.status) {
      rows = await adminSql<AuditEntry[]>`
        SELECT id, tool_name AS "toolName", key_id AS "keyId",
               params, status, error_message AS "errorMessage",
               duration_ms AS "durationMs", created_at AS "createdAt"
        FROM audit_log
        WHERE tenant_id = ${tenantId} AND status = ${opts.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await adminSql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM audit_log
        WHERE tenant_id = ${tenantId} AND status = ${opts.status}
      `;
    } else {
      rows = await adminSql<AuditEntry[]>`
        SELECT id, tool_name AS "toolName", key_id AS "keyId",
               params, status, error_message AS "errorMessage",
               duration_ms AS "durationMs", created_at AS "createdAt"
        FROM audit_log
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await adminSql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM audit_log
        WHERE tenant_id = ${tenantId}
      `;
    }

    return {
      entries: rows,
      totalCount: parseInt(countResult[0].count, 10),
    };
  } finally {
    await adminSql.end();
  }
}
