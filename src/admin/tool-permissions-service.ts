import postgres from 'postgres';
import { sql } from '../db/client.js';
import { getActiveToolNames } from './tool-registry-service.js';
import { logger } from '../logger.js';

/** Cached list of active tool names from the registry. Refreshed on startup and on cache miss. */
let cachedToolNames: string[] | null = null;

/**
 * Get all active tool names from the registry (with in-memory cache).
 * Falls back to an empty array if the registry query fails.
 */
export async function getAllToolNames(): Promise<string[]> {
  if (cachedToolNames && cachedToolNames.length > 0) return cachedToolNames;
  try {
    const names = await getActiveToolNames(sql);
    if (names.length > 0) cachedToolNames = names;
    return names;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch active tool names from registry');
    return [];
  }
}

/** Invalidate the cached tool names (call after registry changes). */
export function invalidateToolNameCache(): void {
  cachedToolNames = null;
}

export interface ToolPermission {
  toolName: string;
  enabled: boolean;
}

/**
 * Get tool permissions for a tenant.
 * Returns all 27 tools with their enabled/disabled status.
 * Tools not in the tool_permissions table default to enabled.
 */
export async function getToolPermissions(tenantId: string): Promise<ToolPermission[]> {
  const rows = await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return txSql<{ tool_name: string; enabled: boolean }[]>`
      SELECT tool_name, enabled FROM tool_permissions
      WHERE tenant_id = ${tenantId}
    `;
  });

  const overrides = new Map(rows.map((r) => [r.tool_name, r.enabled]));
  const allTools = await getAllToolNames();

  return allTools.map((toolName) => ({
    toolName,
    enabled: overrides.get(toolName) ?? true,
  }));
}

/**
 * Get the list of enabled tool names for a tenant, factoring in
 * both tenant-level permissions and per-key allowed_tools.
 */
export async function getEnabledTools(
  tenantId: string,
  keyAllowedTools: string[] | null
): Promise<string[]> {
  const permissions = await getToolPermissions(tenantId);
  let enabled = permissions.filter((p) => p.enabled).map((p) => p.toolName);

  // If the API key has a per-key override, intersect with tenant-level permissions
  if (keyAllowedTools && keyAllowedTools.length > 0) {
    const keySet = new Set(keyAllowedTools);
    enabled = enabled.filter((t) => keySet.has(t));
  }

  return enabled;
}

/**
 * Update tool permissions for a tenant.
 * Accepts an array of { toolName, enabled } pairs.
 * Uses UPSERT to create or update each permission.
 */
export async function updateToolPermissions(
  tenantId: string,
  permissions: ToolPermission[]
): Promise<ToolPermission[]> {
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

    for (const perm of permissions) {
      await txSql`
        INSERT INTO tool_permissions (tenant_id, tool_name, enabled)
        VALUES (${tenantId}, ${perm.toolName}, ${perm.enabled})
        ON CONFLICT (tenant_id, tool_name)
        DO UPDATE SET enabled = ${perm.enabled}, updated_at = now()
      `;
    }
  });

  return getToolPermissions(tenantId);
}

/**
 * Update the allowed_tools array on an API key.
 * Pass null to inherit tenant-level defaults.
 * Pass an array of tool names to restrict this key.
 */
export async function updateKeyAllowedTools(
  tenantId: string,
  keyId: string,
  allowedTools: string[] | null
): Promise<boolean> {
  const result = await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

    if (allowedTools === null) {
      return txSql<{ id: string }[]>`
        UPDATE api_keys SET allowed_tools = NULL
        WHERE id = ${keyId} AND tenant_id = ${tenantId} AND status = 'active'
        RETURNING id
      `;
    }

    return txSql<{ id: string }[]>`
      UPDATE api_keys SET allowed_tools = ${allowedTools as any}
      WHERE id = ${keyId} AND tenant_id = ${tenantId} AND status = 'active'
      RETURNING id
    `;
  });

  return result.length > 0;
}
