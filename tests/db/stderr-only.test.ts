import { describe, it } from 'vitest';

// Requires: src/index.ts has a startup sentinel written to stderr
// Full implementation deferred until Phase 2 when the Fastify server exists.

describe('stderr-only logging — no stdout corruption (INFRA-02 + INFRA-06)', () => {
  it.todo('spawning src/index.ts produces output on stderr, not stdout');
  it.todo('stdout remains empty after server starts');
  it.todo('startup log line appears on stderr within 5 seconds');
});
