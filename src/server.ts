import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import scalarReference from '@scalar/fastify-api-reference';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { adminRouter } from './admin/router.js';
import { signJwt } from './admin/auth-middleware.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    // logger: false — all logging via process.stderr.write(), not Fastify's built-in logger
    // Fastify's logger writes to stdout by default which MUST be kept clean for MCP transport
    logger: false,
  });

  // CORS for dev mode (Vite dev server on port 5173)
  await server.register(cors, {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Secret', 'X-Api-Key', 'Authorization'],
  });

  // Register OpenAPI schema generation
  await server.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'PB MCP Admin API',
        description: 'Tenant provisioning, tool access control, and API key management',
        version: '2.0.0',
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

  // POST /admin/auth/login — unprotected login endpoint (outside admin plugin scope)
  server.post<{ Body: { username: string; password: string } }>('/admin/auth/login', {
    schema: {
      summary: 'Authenticate admin and get JWT',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', properties: { token: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;
    const expectedUsername = process.env.ADMIN_USERNAME ?? 'admin';
    if (username !== expectedUsername || password !== process.env.ADMIN_SECRET) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const token = signJwt({ sub: 'admin' });
    return reply.status(200).send({ token });
  });

  // Admin routes under /admin prefix
  await server.register(adminRouter, { prefix: '/admin' });

  // Serve dashboard static files in production (from dashboard/dist/)
  const dashboardPath = resolve(__dirname, '..', 'dashboard', 'dist');
  if (existsSync(dashboardPath)) {
    await server.register(fastifyStatic, {
      root: dashboardPath,
      prefix: '/dashboard/',
      decorateReply: false,
    });

    // SPA fallback: serve index.html for all dashboard routes
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/admin') || request.url.startsWith('/mcp') || request.url.startsWith('/docs')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html', dashboardPath);
    });
  }

  return server;
}
