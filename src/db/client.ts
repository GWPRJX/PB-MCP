import postgres from 'postgres';

// Application database client.
// Uses DATABASE_URL which connects as app_login (non-superuser, RLS enforced).
// Never use DATABASE_MIGRATION_URL here — that URL has DDL privileges.
if (!process.env.DATABASE_URL) {
  process.stderr.write('[db] ERROR: DATABASE_URL environment variable is not set\n');
  process.exit(1);
}

export const sql = postgres(process.env.DATABASE_URL, {
  // postgres.js built-in pool — adequate for v1 (<50 tenants)
  // PgBouncer is a Phase 2 scaling step when needed
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // All postgres.js log output must go to stderr (INFRA-06)
  onnotice: (notice) => process.stderr.write(`[db] NOTICE: ${notice.message}\n`),
});

// withTenantContext: wraps any tenant-scoped query in a transaction with SET LOCAL.
// SET LOCAL (via set_config true) is transaction-scoped — auto-cleared on commit/rollback.
// This prevents connection pool contamination (see RESEARCH.md Pitfall 2).
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  // Cast tx to Sql to access the tagged-template call signature that Omit<> can drop.
  // TransactionSql extends Omit<Sql, 'begin' | ...> so it retains the template tag,
  // but TypeScript strict mode may not infer it as callable — the cast is safe.
  const result = await sql.begin((tx) => {
    const txSql = tx as unknown as postgres.Sql;
    // Third argument 'true' = LOCAL (transaction-scoped), equivalent to SET LOCAL
    return txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`.then(() =>
      fn(tx)
    );
  });
  return result as T;
}
