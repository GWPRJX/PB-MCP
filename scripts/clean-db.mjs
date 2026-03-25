// Clean-db script: TRUNCATE all tenant data tables (preserves config/meta tables)
import postgres from 'postgres';
import 'dotenv/config';

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  process.stderr.write('ERROR: DATABASE_MIGRATION_URL is not set in .env\n');
  process.exit(1);
}

const sql = postgres(url);

const TABLES = [
  'order_line_items',
  'invoices',
  'orders',
  'stock_levels',
  'products',
  'suppliers',
  'contacts',
];

async function main() {
  process.stdout.write('Truncating tables...\n');
  await sql.unsafe(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  process.stdout.write('\nCleaned tables:\n');
  for (const table of TABLES) {
    process.stdout.write(`  - ${table}\n`);
  }
  process.stdout.write('\nNot touched: tenants, api_keys, tool_permissions, audit_log, kb_articles, server_settings, schema_migrations\n');
  process.stdout.write('\nDone.\n');
  await sql.end();
}

main().catch(err => {
  process.stderr.write(`CLEAN FAILED: ${err.message}\n`);
  process.exit(1);
});
