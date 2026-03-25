#!/usr/bin/env node

/**
 * PB MCP Server — Interactive Setup Script
 *
 * Walks the operator through first-time configuration:
 *   1. Verify DATABASE_URL is set and reachable
 *   2. Set ADMIN_SECRET and JWT_SECRET if not present
 *   3. Create a tenant with ERP credentials
 *   4. Print the MCP config snippet for AI clients
 *
 * Usage:  node scripts/setup.mjs
 */

import { createInterface } from 'readline';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function heading(text) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'='.repeat(60)}\n`);
}

function info(text) {
  console.log(`  ${text}`);
}

function success(text) {
  console.log(`  [OK] ${text}`);
}

function warn(text) {
  console.log(`  [!!] ${text}`);
}

async function main() {
  heading('PB MCP Server Setup');
  info('This wizard will help you configure the PB MCP server.');
  info('Press Ctrl+C at any time to abort.\n');

  // Step 1: Check .env file
  heading('Step 1: Environment Variables');

  let envContent = '';
  if (existsSync(ENV_PATH)) {
    envContent = readFileSync(ENV_PATH, 'utf-8');
    success('.env file found');
  } else {
    info('No .env file found. Creating one...');
    envContent = '';
  }

  const envVars = parseEnv(envContent);

  // DATABASE_URL
  if (!envVars.DATABASE_URL) {
    info('DATABASE_URL is required. This is the PostgreSQL connection string.');
    info('Example: postgresql://postgres:postgres@localhost:5432/pb_mcp');
    const dbUrl = await ask('  DATABASE_URL: ');
    if (!dbUrl.trim()) {
      warn('DATABASE_URL is required. Exiting.');
      process.exit(1);
    }
    envVars.DATABASE_URL = dbUrl.trim();
  } else {
    success(`DATABASE_URL is set`);
  }

  // ADMIN_SECRET
  if (!envVars.ADMIN_SECRET) {
    const generated = randomBytes(32).toString('hex');
    info(`Generating ADMIN_SECRET (used to log in to the admin dashboard)...`);
    envVars.ADMIN_SECRET = generated;
    success(`ADMIN_SECRET generated: ${generated.slice(0, 8)}...`);
    info('Save this secret — you will use it as the admin password.');
  } else {
    success('ADMIN_SECRET is set');
  }

  // JWT_SECRET
  if (!envVars.JWT_SECRET) {
    const generated = randomBytes(32).toString('hex');
    info('Generating JWT_SECRET (used to sign admin session tokens)...');
    envVars.JWT_SECRET = generated;
    success('JWT_SECRET generated');
  } else {
    success('JWT_SECRET is set');
  }

  // PORT
  if (!envVars.PORT) {
    const port = await ask('  Server port (default 3000): ');
    envVars.PORT = port.trim() || '3000';
  } else {
    success(`PORT is set to ${envVars.PORT}`);
  }

  // Write .env
  writeEnv(ENV_PATH, envVars);
  success('.env file updated');

  // Step 2: Database check
  heading('Step 2: Database Connection');
  info('Testing database connection...');
  try {
    const { default: postgres } = await import('postgres');
    const testSql = postgres(envVars.DATABASE_URL, { max: 1 });
    await testSql`SELECT 1`;
    await testSql.end();
    success('Database connection successful');
  } catch (err) {
    warn(`Database connection failed: ${err.message}`);
    info('Make sure PostgreSQL is running and the DATABASE_URL is correct.');
    info('Run database migrations with: npx migrate -path db/migrations -database "$DATABASE_URL" up');
    info('Continuing setup — fix the connection and restart the server.\n');
  }

  // Step 3: Tenant setup prompt
  heading('Step 3: Create Your First Tenant');
  const createNow = await ask('  Create a tenant now? (y/N): ');

  if (createNow.toLowerCase() === 'y') {
    const name = await ask('  Tenant name (e.g. "Acme Corp"): ');
    const slug = await ask('  Tenant slug (e.g. "acme-corp", lowercase letters/numbers/hyphens): ');

    if (!name.trim() || !slug.trim()) {
      warn('Name and slug are required. Skipping tenant creation.');
    } else {
      info('\nPOSibolt ERP credentials (leave blank to configure later in the dashboard):');
      const erpBaseUrl = await ask('  ERP Base URL (e.g. https://your-instance.posibolt.com): ');
      const erpClientId = await ask('  ERP Client ID: ');
      const erpAppSecret = await ask('  ERP App Secret: ');
      const erpUsername = await ask('  ERP Username: ');
      const erpPassword = await ask('  ERP Password: ');
      const erpTerminal = await ask('  ERP Terminal (e.g. "Terminal 1"): ');

      info('\nTenant will be created when you start the server and use the admin dashboard.');
      info('Use these details:');
      info(`  Name: ${name.trim()}`);
      info(`  Slug: ${slug.trim()}`);
      if (erpBaseUrl.trim()) info(`  ERP: ${erpBaseUrl.trim()}`);
    }
  } else {
    info('You can create tenants later via the admin dashboard at /dashboard/tenants/new');
  }

  // Step 4: Print config snippet
  heading('Step 4: MCP Client Configuration');
  const port = envVars.PORT || '3000';
  const baseUrl = `http://localhost:${port}`;

  info('Add this to your AI client\'s MCP config file:');
  info('(Replace YOUR_API_KEY with the key from tenant creation)\n');

  const config = {
    mcpServers: {
      'pb-mcp': {
        url: `${baseUrl}/mcp`,
        headers: {
          Authorization: 'Bearer YOUR_API_KEY_HERE',
        },
      },
    },
  };

  console.log(JSON.stringify(config, null, 2));

  info('\nFor Claude Desktop: paste into claude_desktop_config.json');
  info('For Claude Code CLI: add to ~/.claude/settings.json under mcpServers');
  info('For Cursor: add in Settings > MCP');

  // Done
  heading('Setup Complete');
  info(`Start the server:  npm start`);
  info(`Admin dashboard:   ${baseUrl}/dashboard`);
  info(`Admin password:    ${envVars.ADMIN_SECRET.slice(0, 8)}... (see .env file)`);
  info(`Health check:      ${baseUrl}/health\n`);

  rl.close();
}

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  // Also check process.env for vars not in file
  for (const key of ['DATABASE_URL', 'ADMIN_SECRET', 'JWT_SECRET', 'PORT']) {
    if (!vars[key] && process.env[key]) {
      vars[key] = process.env[key];
    }
  }
  return vars;
}

function writeEnv(path, vars) {
  const lines = [];
  for (const [key, value] of Object.entries(vars)) {
    if (value.includes(' ') || value.includes('"')) {
      lines.push(`${key}="${value}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
