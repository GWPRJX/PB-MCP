import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

// shell: true is required on Windows for npx to resolve correctly.
// Paths with spaces must be quoted explicitly when shell: true is used.

function spawnIndex(env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  const indexPath = resolve(process.cwd(), 'src/index.ts');
  // Quote the path to handle spaces (e.g., "PB MCP" directory)
  return spawnSync('npx', ['tsx', `"${indexPath}"`], {
    env,
    timeout: 10000,
    encoding: 'utf8',
    shell: true,
  });
}

describe('Server process smoke test (INFRA-01)', () => {
  it('src/index.ts exits with code 1 and stderr message when DATABASE_URL is missing', () => {
    const result = spawnIndex({ ...process.env, DATABASE_URL: '', ADMIN_SECRET: 'test' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stdout).toBe('');
  });

  it('src/index.ts exits with code 1 and stderr message when ADMIN_SECRET is missing', () => {
    const result = spawnIndex({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://app_login:changeme@localhost:5432/pb_mcp',
      ADMIN_SECRET: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ADMIN_SECRET');
    expect(result.stdout).toBe('');
  });
});
