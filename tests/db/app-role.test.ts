import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

// These tests connect as app_login (DATABASE_URL) to verify the role is non-superuser
// and cannot execute DDL. This enforces the INFRA-05 requirement.

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const migSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');
  try {
    // Drop any leftover test table from a previous aborted run so the CREATE TABLE test
    // fails with 42501 (permission denied) and not 42P07 (duplicate_table).
    await migSql`DROP TABLE IF EXISTS test_ddl_rejected`;

    // On some PostgreSQL versions the public schema grants CREATE to PUBLIC by default.
    // Revoke it for the duration of the test suite so app_login truly cannot run DDL.
    await migSql`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
  } finally {
    await migSql.end();
  }
});

afterAll(async () => {
  if (sql) await sql.end();

  // Restore the public CREATE grant so other tools/migrations are not affected.
  const migSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');
  try {
    await migSql`GRANT CREATE ON SCHEMA public TO PUBLIC`;
    // Clean up any table that the DDL test may have created if the REVOKE arrived late.
    await migSql`DROP TABLE IF EXISTS test_ddl_rejected`;
  } finally {
    await migSql.end();
  }
});

describe('App role is non-superuser with no BYPASSRLS (INFRA-05)', () => {
  it('app_login connected session shows is_superuser = off', async () => {
    sql = postgres(process.env.DATABASE_URL!);

    const rows = await sql<[{ is_superuser: string }]>`
      SELECT current_setting('is_superuser') AS is_superuser
    `;

    expect(rows[0].is_superuser).toBe('off');
  });

  it('both app_user and app_login have rolbypassrls = false', async () => {
    sql = sql ?? postgres(process.env.DATABASE_URL!);

    // Use DATABASE_MIGRATION_URL for pg_roles query (reliable, no RLS filter confusion)
    const migSql = postgres(process.env.DATABASE_MIGRATION_URL!);
    let rows: { rolname: string; rolbypassrls: boolean }[] = [];
    try {
      rows = await migSql<{ rolname: string; rolbypassrls: boolean }[]>`
        SELECT rolname, rolbypassrls
        FROM pg_roles
        WHERE rolname IN ('app_user', 'app_login')
        ORDER BY rolname
      `;
    } finally {
      await migSql.end();
    }

    expect(rows).toHaveLength(2);
    for (const role of rows) {
      expect(role.rolbypassrls, `${role.rolname} must not have BYPASSRLS`).toBe(false);
    }
  });

  it('app_login cannot execute DDL (CREATE TABLE raises permission denied)', async () => {
    sql = sql ?? postgres(process.env.DATABASE_URL!);

    let errorCode: string | undefined;
    try {
      await sql`CREATE TABLE test_ddl_rejected (id INT)`;
    } catch (err) {
      // postgres.js wraps PostgreSQL errors; the code field carries the SQLSTATE
      errorCode = (err as { code?: string }).code;
    }

    // SQLSTATE 42501 = insufficient_privilege
    expect(
      errorCode,
      'Expected PostgreSQL error 42501 (insufficient_privilege) but got: ' + errorCode
    ).toBe('42501');
  });
});
