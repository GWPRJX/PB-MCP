import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Load .env for integration tests
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://app_login:changeme@localhost:5432/pb_mcp',
      DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp',
    },
    // Increase timeout for DB integration tests
    testTimeout: 30000,
  },
});
