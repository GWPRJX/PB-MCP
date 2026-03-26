/**
 * Tool API config resolver.
 *
 * Reads endpoint overrides from tool_registry.parameters JSONB column.
 * Caches in memory with a short TTL to avoid hitting the DB on every tool call.
 */

import { sql } from '../db/client.js';
import { logger } from '../logger.js';

export interface ToolApiConfig {
  endpoint: string;
  method?: string;
  notes?: string;
}

interface CachedConfig {
  data: Map<string, ToolApiConfig>;
  expiresAt: number;
}

let cache: CachedConfig | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load all tool configs from the registry into cache.
 */
async function loadConfigs(): Promise<Map<string, ToolApiConfig>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const rows = await sql`
    SELECT tool_name, parameters FROM tool_registry
    WHERE parameters IS NOT NULL AND parameters != 'null'::jsonb
  `;

  const map = new Map<string, ToolApiConfig>();
  for (const row of rows) {
    const params = row.parameters as Record<string, unknown> | null;
    if (params?.endpoint && typeof params.endpoint === 'string') {
      map.set(row.tool_name, {
        endpoint: params.endpoint,
        method: typeof params.method === 'string' ? params.method : undefined,
        notes: typeof params.notes === 'string' ? params.notes : undefined,
      });
    }
  }

  cache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  logger.debug({ count: map.size }, 'Tool API configs loaded');
  return map;
}

/**
 * Get the configured API endpoint for a tool, falling back to the default.
 *
 * @param toolName - The MCP tool name (e.g. 'list_products')
 * @param defaultEndpoint - The hardcoded fallback endpoint
 * @returns The configured endpoint or the default
 */
export async function getToolEndpoint(toolName: string, defaultEndpoint: string): Promise<string> {
  const configs = await loadConfigs();
  const config = configs.get(toolName);
  return config?.endpoint ?? defaultEndpoint;
}

/** Invalidate the config cache (call after updating a tool's config). */
export function invalidateToolConfigCache(): void {
  cache = null;
}
