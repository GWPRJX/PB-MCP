import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Tests require: Fastify server with MCP routes from plan 02-04 (Wave 4)
// Uses fastify.inject() to send MCP initialize requests.

describe('MCP auth — X-Api-Key header validation (TENANT-06)', () => {
  it.todo('valid API key in X-Api-Key header returns 200 with MCP initialize response');
  it.todo('missing X-Api-Key header returns 401 with error message');
  it.todo('invalid (non-existent) API key returns 401');
  it.todo('revoked API key returns 401 immediately after revocation');
  it.todo('malformed key (wrong format) returns 401');
});

describe('MCP auth — tenant_id resolution and RLS (TENANT-07)', () => {
  it.todo('authenticated request resolves API key to correct tenant_id');
  it.todo('tenant_id is stored in AsyncLocalStorage for the request lifecycle');
  it.todo('DB transaction within authenticated request has app.current_tenant_id set');
  it.todo('two concurrent requests with different keys resolve to different tenant_ids');
});
