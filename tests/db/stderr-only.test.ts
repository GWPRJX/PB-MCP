import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

// Spawn src/index.ts as a child process via tsx and verify stderr-only logging.
// Requires: DATABASE_URL and ADMIN_SECRET set (or the process exits 1 immediately — that's fine for this test).
// shell: true is required on Windows for npx to resolve correctly.
// Paths with spaces must be quoted explicitly when shell: true is used.

const INDEX_PATH = `"${resolve(process.cwd(), 'src/index.ts')}"`;

describe('stderr-only logging — no stdout corruption (INFRA-02 + INFRA-06)', () => {
  it('spawning src/index.ts with missing env vars writes error to stderr, not stdout', () => {
    // Unset DATABASE_URL to trigger the early exit path in src/index.ts
    const result = spawnSync('npx', ['tsx', INDEX_PATH], {
      env: { ...process.env, DATABASE_URL: '', ADMIN_SECRET: '' },
      timeout: 10000,
      encoding: 'utf8',
      shell: true,
    });

    // stdout must be empty — all output goes to stderr
    expect(result.stdout).toBe('');
    // stderr must contain an error message about DATABASE_URL
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('stdout remains empty — MCP transport safety (INFRA-06)', () => {
    // Even with valid env vars, the server should produce zero stdout.
    // We test with missing vars (fast exit) to avoid needing a running DB.
    const env = { ...process.env };
    delete env['DATABASE_URL'];
    delete env['ADMIN_SECRET'];
    const result = spawnSync('npx', ['tsx', INDEX_PATH], {
      env,
      timeout: 10000,
      encoding: 'utf8',
      shell: true,
    });

    expect(result.stdout).toBe('');
  });
});
