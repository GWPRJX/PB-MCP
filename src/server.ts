import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import scalarReference from '@scalar/fastify-api-reference';
import { adminRouter } from './admin/router.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    // logger: false — all logging via process.stderr.write(), not Fastify's built-in logger
    // Fastify's logger writes to stdout by default which MUST be kept clean for MCP transport
    logger: false,
  });

  // Register OpenAPI schema generation
  await server.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'PB MCP Admin API',
        description: 'Tenant provisioning and API key management',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          adminSecret: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Admin-Secret',
          },
        },
      },
    },
  });

  // Scalar API reference UI at /docs
  await server.register(scalarReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'PB MCP Admin API',
      theme: 'default',
    },
  });

  // Admin routes under /admin prefix
  await server.register(adminRouter, { prefix: '/admin' });

  return server;
}
