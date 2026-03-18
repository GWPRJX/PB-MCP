import { createHash } from 'crypto';
import postgres from 'postgres';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { lookupApiKeyByHash } from '../admin/tenant-service.js';
import { getEnabledTools } from '../admin/tool-permissions-service.js';
import { tenantStorage } from '../context.js';
import type { PosiboltConfig } from '../posibolt/client.js';

/**
 * Load the tenant's ERP configuration from the tenants table.
 * Returns null if no ERP config is set (all ERP columns are nullable).
 */
async function loadErpConfig(tenantId: string): Promise<PosiboltConfig | null> {
  if (!process.env.DATABASE_MIGRATION_URL) return null;

  const adminSql = postgres(process.env.DATABASE_MIGRATION_URL, { max: 2 });
  try {
    const rows = await adminSql<{
      erp_base_url: string | null;
      erp_client_id: string | null;
      erp_app_secret: string | null;
      erp_username: string | null;
      erp_password: string | null;
      erp_terminal: string | null;
    }[]>`
      SELECT erp_base_url, erp_client_id, erp_app_secret,
             erp_username, erp_password, erp_terminal
      FROM tenants WHERE id = ${tenantId}
    `;

    if (rows.length === 0) return null;
    const r = rows[0];

    // All 6 fields must be set for a valid config
    if (!r.erp_base_url || !r.erp_client_id || !r.erp_app_secret ||
        !r.erp_username || !r.erp_password || !r.erp_terminal) {
      return null;
    }

    return {
      baseUrl: r.erp_base_url,
      clientId: r.erp_client_id,
      appSecret: r.erp_app_secret,
      username: r.erp_username,
      password: r.erp_password,
      terminal: r.erp_terminal,
    };
  } finally {
    await adminSql.end();
  }
}

/**
 * Extract the X-Api-Key header, hash it with SHA-256, look up the tenant,
 * load ERP config and enabled tools, and run the handler within the tenant's
 * AsyncLocalStorage context.
 */
export async function extractAndValidateApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  handler: () => Promise<void>
): Promise<void> {
  const rawKey = request.headers['x-api-key'];

  if (!rawKey || typeof rawKey !== 'string') {
    reply.status(401).send({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Missing X-Api-Key header' },
      id: null,
    });
    return;
  }

  const hash = createHash('sha256').update(rawKey).digest('hex');
  const result = await lookupApiKeyByHash(hash);

  if (result && 'expired' in result) {
    reply.status(401).send({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'API key expired' },
      id: null,
    });
    return;
  }

  if (!result) {
    reply.status(401).send({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid or revoked API key' },
      id: null,
    });
    return;
  }

  // Load ERP config and enabled tools in parallel
  const [erpConfig, enabledTools] = await Promise.all([
    loadErpConfig(result.tenantId),
    getEnabledTools(result.tenantId, result.allowedTools),
  ]);

  // Run handler within tenant context (includes ERP config + enabled tools)
  await tenantStorage.run(
    { tenantId: result.tenantId, keyId: result.keyId, erpConfig, enabledTools },
    handler
  );
}
