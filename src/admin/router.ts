import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import {
  createTenant,
  listTenants,
  getTenant,
  createApiKey,
  revokeApiKey,
  updateTenantErpConfig,
} from './tenant-service.js';
import { syncKbArticles } from '../kb/sync.js';
import { getSettings, updateSettings, getSyncStatus, updateSyncStatus } from './settings-service.js';
import {
  getToolPermissions,
  updateToolPermissions,
  updateKeyAllowedTools,
  ALL_TOOLS,
} from './tool-permissions-service.js';
import { queryAuditLog } from './audit-service.js';
import { jwtAuthHook } from './auth-middleware.js';
import { sql } from '../db/client.js';

export async function adminRouter(server: FastifyInstance): Promise<void> {
  // Apply JWT/admin-secret auth hook to ALL routes in this plugin scope
  server.addHook('onRequest', jwtAuthHook);

  // ──────────────────────────────────────────────────────────────
  // POST /admin/tenants — create tenant + initial API key
  // ──────────────────────────────────────────────────────────────
  server.post<{
    Body: {
      name: string;
      slug: string;
      plan?: string;
      erpBaseUrl?: string;
      erpClientId?: string;
      erpAppSecret?: string;
      erpUsername?: string;
      erpPassword?: string;
      erpTerminal?: string;
    };
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
          erpBaseUrl: { type: 'string' },
          erpClientId: { type: 'string' },
          erpAppSecret: { type: 'string' },
          erpUsername: { type: 'string' },
          erpPassword: { type: 'string' },
          erpTerminal: { type: 'string' },
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
    const {
      name,
      slug,
      plan = 'standard',
      erpBaseUrl,
      erpClientId,
      erpAppSecret,
      erpUsername,
      erpPassword,
      erpTerminal,
    } = request.body;

    const erpConfig = (erpBaseUrl || erpClientId || erpAppSecret || erpUsername || erpPassword || erpTerminal)
      ? { erpBaseUrl, erpClientId, erpAppSecret, erpUsername, erpPassword, erpTerminal }
      : undefined;

    try {
      const { tenant, rawApiKey } = await createTenant(name, slug, plan, erpConfig);
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
  // POST /admin/test-erp-credentials — test ERP credentials without a tenant
  // ──────────────────────────────────────────────────────────────
  server.post<{
    Body: {
      erpBaseUrl: string;
      erpClientId: string;
      erpAppSecret: string;
      erpUsername: string;
      erpPassword: string;
      erpTerminal: string;
    };
  }>('/test-erp-credentials', {
    schema: {
      summary: 'Test ERP credentials without creating a tenant',
      description: 'Attempts OAuth token acquisition with raw credentials. Use during onboarding before tenant creation.',
      security: [{ adminSecret: [] }],
      body: {
        type: 'object',
        required: ['erpBaseUrl', 'erpClientId', 'erpAppSecret', 'erpUsername', 'erpPassword', 'erpTerminal'],
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
        200: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { testErpCredentials } = await import('./connection-tester.js');
    const result = await testErpCredentials(request.body);
    return reply.status(200).send(result);
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
            erpBaseUrl: { type: 'string', nullable: true },
            erpClientId: { type: 'string', nullable: true },
            erpAppSecret: { type: 'string', nullable: true },
            erpUsername: { type: 'string', nullable: true },
            erpPassword: { type: 'string', nullable: true },
            erpTerminal: { type: 'string', nullable: true },
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
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  allowedTools: { type: 'array', items: { type: 'string' }, nullable: true },
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
  // GET /admin/kb/settings — get YouTrack configuration settings
  // ──────────────────────────────────────────────────────────────
  server.get('/kb/settings', {
    schema: {
      summary: 'Get YouTrack KB configuration settings',
      security: [{ adminSecret: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            youtrackBaseUrl: { type: ['string', 'null'] },
            youtrackToken: { type: ['string', 'null'] },
            youtrackProject: { type: ['string', 'null'] },
            syncIntervalMs: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const settings = await getSettings();
    // Mask token for display: show first 4 and last 4 chars
    let maskedToken: string | null = null;
    if (settings.youtrackToken) {
      const t = settings.youtrackToken;
      maskedToken = t.length > 8 ? `${t.slice(0, 4)}${'*'.repeat(t.length - 8)}${t.slice(-4)}` : '****';
    }
    return reply.status(200).send({
      ...settings,
      youtrackToken: maskedToken,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /admin/kb/settings — update YouTrack configuration settings
  // ──────────────────────────────────────────────────────────────
  server.put<{
    Body: {
      youtrackBaseUrl?: string;
      youtrackToken?: string;
      youtrackProject?: string;
      syncIntervalMs?: number;
    };
  }>('/kb/settings', {
    schema: {
      summary: 'Update YouTrack KB configuration settings',
      security: [{ adminSecret: [] }],
      body: {
        type: 'object',
        properties: {
          youtrackBaseUrl: { type: 'string' },
          youtrackToken: { type: 'string' },
          youtrackProject: { type: 'string' },
          syncIntervalMs: { type: 'number', minimum: 60000 },
        },
      },
      response: {
        200: { type: 'object', properties: { updated: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { youtrackBaseUrl, youtrackToken, youtrackProject, syncIntervalMs } = request.body;
    if (syncIntervalMs !== undefined && syncIntervalMs < 60000) {
      return reply.status(400).send({ error: 'Sync interval must be at least 60000ms (1 minute)' });
    }
    await updateSettings({ youtrackBaseUrl, youtrackToken, youtrackProject, syncIntervalMs });
    return reply.status(200).send({ updated: true });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/kb/sync-status — get KB sync status
  // ──────────────────────────────────────────────────────────────
  server.get('/kb/sync-status', {
    schema: {
      summary: 'Get KB sync status (last sync time, article count, errors)',
      security: [{ adminSecret: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            lastSyncAt: { type: ['string', 'null'] },
            lastSyncArticleCount: { type: ['number', 'null'] },
            lastSyncError: { type: ['string', 'null'] },
            totalArticleCount: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const status = await getSyncStatus();
    return reply.status(200).send(status);
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
        500: {
          type: 'object',
          properties: {
            synced: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    try {
      const result = await syncKbArticles();
      await updateSyncStatus({
        syncedAt: result.synced_at.toISOString(),
        articleCount: result.article_count,
      });
      return reply.status(200).send({ synced: true, article_count: result.article_count });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateSyncStatus({
        syncedAt: new Date().toISOString(),
        articleCount: 0,
        error: errorMsg,
      }).catch(() => {}); // Don't fail the request if status update fails
      return reply.status(500).send({ synced: false, error: errorMsg });
    }
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

  // ──────────────────────────────────────────────────────────────
  // POST /admin/kb/upload — Upload a new API doc
  // ──────────────────────────────────────────────────────────────
  server.post<{
    Body: { title: string; content: string; tags?: string[] };
  }>('/kb/upload', {
    schema: {
      summary: 'Upload a new API doc',
      description: 'Creates a kb_articles row with DOC-* youtrack_id prefix. Immediately searchable via MCP tools.',
      security: [{ adminSecret: [] }],
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', minLength: 1 },
          content: { type: 'string', minLength: 1 },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            youtrackId: { type: 'string' },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { title, content, tags = [] } = request.body;

    if (content.length > 1_048_576) {
      return reply.status(400).send({ error: 'Content exceeds maximum size of 1MB' });
    }

    const youtrackId = `DOC-${crypto.randomUUID().split('-')[0]}`;
    const contentHash = createHash('sha256').update(content).digest('hex');

    const [row] = await sql`
      INSERT INTO kb_articles (youtrack_id, summary, content, tags, content_hash)
      VALUES (${youtrackId}, ${title}, ${content}, ${tags}, ${contentHash})
      RETURNING id, youtrack_id, summary, tags, synced_at
    `;

    return reply.status(201).send({
      id: row.id,
      youtrackId: row.youtrack_id,
      title: row.summary,
      tags: row.tags,
      createdAt: row.synced_at,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/kb/docs — List uploaded docs (DOC-* prefix only)
  // ──────────────────────────────────────────────────────────────
  server.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/kb/docs', {
    schema: {
      summary: 'List uploaded API docs',
      security: [{ adminSecret: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
          offset: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 25;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

    const [countRow] = await sql`SELECT COUNT(*)::int AS count FROM kb_articles WHERE youtrack_id LIKE 'DOC-%'`;
    const rows = await sql`
      SELECT id, youtrack_id, summary, tags, synced_at
      FROM kb_articles
      WHERE youtrack_id LIKE 'DOC-%'
      ORDER BY synced_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return reply.status(200).send({
      docs: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        youtrackId: r.youtrack_id,
        title: r.summary,
        tags: r.tags,
        createdAt: r.synced_at,
      })),
      totalCount: countRow.count,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /admin/kb/docs/:id — Get single uploaded doc with full content
  // ──────────────────────────────────────────────────────────────
  server.get<{
    Params: { id: string };
  }>('/kb/docs/:id', {
    schema: {
      summary: 'Get a single uploaded API doc with full content',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const [row] = await sql`
      SELECT id, youtrack_id, summary, content, tags, synced_at
      FROM kb_articles
      WHERE id = ${request.params.id} AND youtrack_id LIKE 'DOC-%'
    `;

    if (!row) {
      return reply.status(404).send({ error: 'Doc not found' });
    }

    return reply.status(200).send({
      id: row.id,
      youtrackId: row.youtrack_id,
      title: row.summary,
      content: row.content,
      tags: row.tags,
      createdAt: row.synced_at,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /admin/kb/docs/:id — Update an uploaded doc
  // ──────────────────────────────────────────────────────────────
  server.put<{
    Params: { id: string };
    Body: { title?: string; content?: string; tags?: string[] };
  }>('/kb/docs/:id', {
    schema: {
      summary: 'Update an uploaded API doc',
      description: 'Only DOC-* prefixed docs can be edited. YouTrack-synced articles are protected.',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1 },
          content: { type: 'string', minLength: 1 },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: { type: 'object', properties: { updated: { type: 'boolean' } } },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { title, content, tags } = request.body;

    if (content !== undefined && content.length > 1_048_576) {
      return reply.status(400).send({ error: 'Content exceeds maximum size of 1MB' });
    }

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: (string | string[])[] = [];

    if (title !== undefined) {
      values.push(title);
      sets.push(`summary = $${values.length}`);
    }
    if (content !== undefined) {
      values.push(content);
      sets.push(`content = $${values.length}`);
      const hash = createHash('sha256').update(content).digest('hex');
      values.push(hash);
      sets.push(`content_hash = $${values.length}`);
    }
    if (tags !== undefined) {
      values.push(tags);
      sets.push(`tags = $${values.length}`);
    }

    if (sets.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    // Always update synced_at
    sets.push(`synced_at = NOW()`);

    // Add WHERE clause params
    values.push(request.params.id);
    const idParam = `$${values.length}`;

    const query = `UPDATE kb_articles SET ${sets.join(', ')} WHERE id = ${idParam} AND youtrack_id LIKE 'DOC-%'`;
    const result = await sql.unsafe(query, values);

    if (result.count === 0) {
      return reply.status(404).send({ error: 'Doc not found' });
    }

    return reply.status(200).send({ updated: true });
  });

  // ──────────────────────────────────────────────────────────────
  // DELETE /admin/kb/docs/:id — Delete an uploaded doc
  // ──────────────────────────────────────────────────────────────
  server.delete<{
    Params: { id: string };
  }>('/kb/docs/:id', {
    schema: {
      summary: 'Delete an uploaded API doc',
      description: 'Only DOC-* prefixed docs can be deleted. YouTrack-synced articles are protected.',
      security: [{ adminSecret: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const result = await sql`
      DELETE FROM kb_articles WHERE id = ${request.params.id} AND youtrack_id LIKE 'DOC-%'
    `;

    if (result.count === 0) {
      return reply.status(404).send({ error: 'Doc not found' });
    }

    return reply.status(204).send();
  });
}
