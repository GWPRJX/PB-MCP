import postgres from 'postgres';
import { getToken, type PosiboltConfig } from '../posibolt/client.js';

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
