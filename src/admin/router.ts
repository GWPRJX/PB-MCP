import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createTenant,
  listTenants,
  getTenant,
  createApiKey,
  revokeApiKey,
} from './tenant-service.js';
import { syncKbArticles } from '../kb/sync.js';

// Admin auth check — all routes in this plugin require X-Admin-Secret header
async function checkAdminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secret = request.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing X-Admin-Secret header' });
  }
}

export async function adminRouter(server: FastifyInstance): Promise<void> {
  // Apply auth hook to ALL routes in this plugin scope
  server.addHook('onRequest', checkAdminAuth);

  // ──────────────────────────────────────────────────────────────
  // POST /admin/tenants — create tenant + initial API key
  // ──────────────────────────────────────────────────────────────
  server.post<{
    Body: { name: string; slug: string; plan?: string };
  }>('/tenants', {
    schema: {
      summary: 'Create a new tenant',
      description: 'Creates a tenant and issues an initial API key. The raw API key is shown exactly once.',
      security: [{ adminSecret: [] }],
      body: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          slug: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9-]+$' },
          plan: { type: 'string', enum: ['standard', 'pro', 'enterprise'], default: 'standard' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            apiKey: { type: 'string', description: 'Raw API key — shown once, never retrievable' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { name, slug, plan = 'standard' } = request.body;

    try {
      const { tenant, rawApiKey } = await createTenant(name, slug, plan);
      return reply.status(201).send({ tenantId: tenant.id, apiKey: rawApiKey });
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'DUPLICATE_SLUG') {
        return reply.status(409).send({ error: `Tenant with slug '${slug}' already exists` });
      }
      process.stderr.write(`[admin] ERROR creating tenant: ${error.message}\n`);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/tenants — list all tenants
  // ──────────────────────────────────────────────────────────────
  server.get('/tenants', {
    schema: {
      summary: 'List all tenants',
      security: [{ adminSecret: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              slug: { type: 'string' },
              plan: { type: 'string' },
              status: { type: 'string' },
              keyCount: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const tenantList = await listTenants();
    return reply.status(200).send(tenantList);
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/tenants/:id — get single tenant with keys
  // ──────────────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>('/tenants/:id', {
    schema: {
      summary: 'Get tenant details',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            plan: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            apiKeys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  label: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  revokedAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const tenant = await getTenant(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }
    return reply.status(200).send(tenant);
  });

  // ──────────────────────────────────────────────────────────────
  // POST /admin/tenants/:id/keys — issue additional API key
  // ──────────────────────────────────────────────────────────────
  server.post<{
    Params: { id: string };
    Body: { label?: string };
  }>('/tenants/:id/keys', {
    schema: {
      summary: 'Issue a new API key for a tenant',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 200 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            keyId: { type: 'string', format: 'uuid' },
            apiKey: { type: 'string', description: 'Raw API key — shown once, never retrievable' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    // Verify tenant exists first
    const tenant = await getTenant(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }

    const { apiKey, rawKey } = await createApiKey(request.params.id, request.body?.label);
    return reply.status(201).send({ keyId: apiKey.id, apiKey: rawKey });
  });

  // ──────────────────────────────────────────────────────────────
  // DELETE /admin/tenants/:id/keys/:keyId — revoke API key
  // ──────────────────────────────────────────────────────────────
  server.delete<{ Params: { id: string; keyId: string } }>('/tenants/:id/keys/:keyId', {
    schema: {
      summary: 'Revoke a tenant API key',
      description: 'Immediately revokes the key. Any MCP request using this key after revocation returns 401.',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          keyId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const revoked = await revokeApiKey(request.params.id, request.params.keyId);
    if (!revoked) {
      return reply.status(404).send({ error: 'API key not found or already revoked' });
    }
    return reply.status(204).send();
  });

  // ──────────────────────────────────────────────────────────────
  // POST /admin/kb/refresh — trigger immediate KB re-sync
  // ──────────────────────────────────────────────────────────────
  server.post('/kb/refresh', {
    schema: {
      summary: 'Trigger immediate KB re-sync from YouTrack',
      description: 'Immediately fetches all articles from YouTrack and replaces the kb_articles cache atomically.',
      response: {
        200: {
          type: 'object',
          properties: {
            synced: { type: 'boolean' },
            article_count: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const result = await syncKbArticles();
    return reply.status(200).send({ synced: true, article_count: result.article_count });
  });
}
