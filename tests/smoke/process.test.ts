import { describe, it } from 'vitest';

// Smoke test for INFRA-01: single Node.js process.
// Full test deferred until Phase 2 Fastify server implementation.

describe('Server process smoke test (INFRA-01)', () => {
  it.todo('src/index.ts can be spawned as a child process without crashing');
  it.todo('process exits cleanly when SIGTERM received');
});
