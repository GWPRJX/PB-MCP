import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Tests require: Fastify server with MCP routes from plan 02-04 (Wave 4)
// Verifies Streamable HTTP transport per MCP spec (not stdio).

describe('MCP Streamable HTTP transport (INFRA-02)', () => {
  it.todo('POST /mcp accepts application/json and returns application/json');
  it.todo('POST /mcp with valid initialize request returns MCP protocol response');
  it.todo('GET /mcp returns SSE stream (text/event-stream content-type)');
  it.todo('DELETE /mcp returns 200 session termination');
  it.todo('tools/list returns empty array before any tools are registered');
  it.todo('MCP server does NOT write to stdout (stderr only)');
});
