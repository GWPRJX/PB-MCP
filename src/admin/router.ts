import type { FastifyInstance } from 'fastify';
import {
  createTenant,
  listTenants,
  getTenant,
  createApiKey,
  revokeApiKey,
  updateTenantErpConfig,
} from './tenant-service.js';
import { syncKbArticles } from '../kb/sync.js';
import {
  getToolPermissions,
  updateToolPermissions,
  updateKeyAllowedTools,
  ALL_TOOLS,
} from './tool-permissions-service.js';
import { queryAuditLog } from './audit-service.js';
import { jwtAuthHook } from './auth-middleware.js';

export async function adminRouter(server: FastifyInstance): Promise<void> {
  // Apply JWT/admin-secret auth hook to ALL routes in this plugin scope
  server.addHook('onRequest', jwtAuthHook);

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
    Body: { label?: string; expiresAt?: string | null };
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
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
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

    const { apiKey, rawKey } = await createApiKey(request.params.id, request.body?.label, request.body?.expiresAt);
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

  // ──────────────────────────────────────────────────────────────
  // GET /admin/tenants/:id/tools — get tool permissions for tenant
  // ──────────────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>('/tenants/:id/tools', {
    schema: {
      summary: 'Get tool permissions for a tenant',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              toolName: { type: 'string' },
              enabled: { type: 'boolean' },
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
    const permissions = await getToolPermissions(request.params.id);
    return reply.status(200).send(permissions);
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /admin/tenants/:id/tools — update tool permissions
  // ──────────────────────────────────────────────────────────────
  server.put<{
    Params: { id: string };
    Body: { permissions: { toolName: string; enabled: boolean }[] };
  }>('/tenants/:id/tools', {
    schema: {
      summary: 'Update tool permissions for a tenant',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['permissions'],
        properties: {
          permissions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['toolName', 'enabled'],
              properties: {
                toolName: { type: 'string' },
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              toolName: { type: 'string' },
              enabled: { type: 'boolean' },
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

    // Validate tool names
    const validTools = new Set<string>(ALL_TOOLS);
    for (const perm of request.body.permissions) {
      if (!validTools.has(perm.toolName)) {
        return reply.status(400).send({ error: `Unknown tool: ${perm.toolName}` });
      }
    }

    const result = await updateToolPermissions(request.params.id, request.body.permissions);
    return reply.status(200).send(result);
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /admin/tenants/:id/keys/:keyId/tools — per-key tool scoping
  // ──────────────────────────────────────────────────────────────
  server.put<{
    Params: { id: string; keyId: string };
    Body: { allowedTools: string[] | null };
  }>('/tenants/:id/keys/:keyId/tools', {
    schema: {
      summary: 'Set per-key tool restrictions',
      description: 'Pass null to inherit tenant defaults. Pass an array of tool names to restrict this key.',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          keyId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['allowedTools'],
        properties: {
          allowedTools: {
            oneOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'null' },
            ],
          },
        },
      },
      response: {
        200: { type: 'object', properties: { updated: { type: 'boolean' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    // Validate tool names if provided
    if (request.body.allowedTools) {
      const validTools = new Set<string>(ALL_TOOLS);
      for (const tool of request.body.allowedTools) {
        if (!validTools.has(tool)) {
          return reply.status(400).send({ error: `Unknown tool: ${tool}` });
        }
      }
    }

    const updated = await updateKeyAllowedTools(
      request.params.id,
      request.params.keyId,
      request.body.allowedTools
    );
    if (!updated) {
      return reply.status(404).send({ error: 'API key not found or revoked' });
    }
    return reply.status(200).send({ updated: true });
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /admin/tenants/:id/erp-config — update ERP configuration
  // ──────────────────────────────────────────────────────────────
  server.put<{
    Params: { id: string };
    Body: {
      erpBaseUrl?: string;
      erpClientId?: string;
      erpAppSecret?: string;
      erpUsername?: string;
      erpPassword?: string;
      erpTerminal?: string;
    };
  }>('/tenants/:id/erp-config', {
    schema: {
      summary: 'Update ERP configuration for a tenant',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          erpBaseUrl: { type: 'string' },
          erpClientId: { type: 'string' },
          erpAppSecret: { type: 'string' },
          erpUsername: { type: 'string' },
          erpPassword: { type: 'string' },
          erpTerminal: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', properties: { updated: { type: 'boolean' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const tenant = await getTenant(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }
    await updateTenantErpConfig(request.params.id, request.body);
    return reply.status(200).send({ updated: true });
  });

  // ──────────────────────────────────────────────────────────────
  // POST /admin/tenants/:id/test-connection — test ERP connection
  // ──────────────────────────────────────────────────────────────
  server.post<{ Params: { id: string } }>('/tenants/:id/test-connection', {
    schema: {
      summary: 'Test ERP connection for a tenant',
      description: 'Attempts to authenticate with the POSibolt API using the tenant\'s stored credentials.',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { testErpConnection } = await import('./connection-tester.js');
    const result = await testErpConnection(request.params.id);
    return reply.status(200).send(result);
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/tenants/:id/audit-log — query audit log
  // ──────────────────────────────────────────────────────────────
  server.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; toolName?: string; status?: string };
  }>('/tenants/:id/audit-log', {
    schema: {
      summary: 'Query audit log for a tenant',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
          offset: { type: 'string' },
          toolName: { type: 'string' },
          status: { type: 'string', enum: ['success', 'error'] },
        },
      },
    },
  }, async (request, reply) => {
    const tenant = await getTenant(request.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }

    const result = await queryAuditLog(request.params.id, {
      limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
      offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
      toolName: request.query.toolName,
      status: request.query.status,
    });

    return reply.status(200).send(result);
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/tools — list all available tools
  // ──────────────────────────────────────────────────────────────
  server.get('/tools', {
    schema: {
      summary: 'List all available MCP tools',
      security: [{ adminSecret: [] }],
      response: {
        200: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.status(200).send([...ALL_TOOLS]);
  });
}
