import { createHash } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { lookupApiKeyByHash } from '../admin/tenant-service.js';
import { tenantStorage } from '../context.js';

/**
 * Extract the X-Api-Key header, hash it with SHA-256, look up the tenant, and
 * run the handler within the tenant's AsyncLocalStorage context.
 *
 * If the key is missing, invalid, or revoked: sends 401 and returns without
 * calling the handler.
 *
 * Usage in Fastify route handlers:
 *   await extractAndValidateApiKey(request, reply, async () => {
 *     // getTenantId() is available here
 *   });
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

  if (!result) {
    reply.status(401).send({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid or revoked API key' },
      id: null,
    });
    return;
  }

  // Run the handler within the tenant's AsyncLocalStorage context.
  // This makes getTenantId() available throughout the async call chain.
  await tenantStorage.run({ tenantId: result.tenantId, keyId: result.keyId }, handler);
}
