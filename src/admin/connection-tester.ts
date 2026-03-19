import postgres from 'postgres';
import { getToken, type PosiboltConfig } from '../posibolt/client.js';

/**
 * Test ERP credentials directly (no database lookup required).
 * Used during onboarding before a tenant record exists.
 */
export async function testErpCredentials(credentials: {
  erpBaseUrl: string;
  erpClientId: string;
  erpAppSecret: string;
  erpUsername: string;
  erpPassword: string;
  erpTerminal: string;
}): Promise<{ connected: boolean; message: string }> {
  try {
    const config: PosiboltConfig = {
      baseUrl: credentials.erpBaseUrl,
      clientId: credentials.erpClientId,
      appSecret: credentials.erpAppSecret,
      username: credentials.erpUsername,
      password: credentials.erpPassword,
      terminal: credentials.erpTerminal,
    };
    await getToken(config);
    return { connected: true, message: 'Successfully authenticated with POSibolt API' };
  } catch (err) {
    const msg = (err as Error).message;
    let hint = '';
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      hint = ' — Check the Base URL: the hostname could not be resolved.';
    } else if (msg.includes('ECONNREFUSED')) {
      hint = ' — The server refused the connection. Verify the Base URL and port.';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      hint = ' — Connection timed out. Check if the server is reachable from this network.';
    } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_client')) {
      hint = ' — Authentication failed. Double-check Client ID, App Secret, Username, and Password.';
    } else if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
      hint = ' — SSL/TLS error. The server certificate may be invalid or self-signed.';
    }
    return { connected: false, message: `Connection failed: ${msg}${hint}` };
  }
}

/**
 * Test ERP connection for a tenant by attempting OAuth token acquisition.
 */
export async function testErpConnection(
  tenantId: string
): Promise<{ connected: boolean; message: string }> {
  if (!process.env.DATABASE_MIGRATION_URL) {
    return { connected: false, message: 'DATABASE_MIGRATION_URL not configured' };
  }

  const adminSql = postgres(process.env.DATABASE_MIGRATION_URL, { max: 2 });

  try {
    const rows = await adminSql<{
      erp_base_url: string | null;
      erp_client_id: string | null;
      erp_app_secret: string | null;
      erp_username: string | null;
      erp_password: string | null;
      erp_terminal: string | null;
    }[]>`
      SELECT erp_base_url, erp_client_id, erp_app_secret,
             erp_username, erp_password, erp_terminal
      FROM tenants WHERE id = ${tenantId}
    `;

    if (rows.length === 0) {
      return { connected: false, message: 'Tenant not found' };
    }

    const r = rows[0];
    if (!r.erp_base_url || !r.erp_client_id || !r.erp_app_secret ||
        !r.erp_username || !r.erp_password || !r.erp_terminal) {
      return { connected: false, message: 'ERP configuration incomplete — all 6 fields required' };
    }

    const config: PosiboltConfig = {
      baseUrl: r.erp_base_url,
      clientId: r.erp_client_id,
      appSecret: r.erp_app_secret,
      username: r.erp_username,
      password: r.erp_password,
      terminal: r.erp_terminal,
    };

    // Attempt to get a token — this validates credentials
    await getToken(config);
    return { connected: true, message: 'Successfully authenticated with POSibolt API' };
  } catch (err) {
    return { connected: false, message: `Connection failed: ${(err as Error).message}` };
  } finally {
    await adminSql.end();
  }
}
