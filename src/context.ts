import { AsyncLocalStorage } from 'async_hooks';
import type { PosiboltConfig } from './posibolt/client.js';

export interface TenantContext {
  tenantId: string;
  keyId: string;
  erpConfig: PosiboltConfig | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Get the current tenant ID from AsyncLocalStorage.
 * Throws if called outside a tenant-authenticated request context.
 */
export function getTenantId(): string {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      '[context] getTenantId() called outside tenant context — ensure MCP auth middleware ran'
    );
  }
  return ctx.tenantId;
}

/**
 * Get the current tenant's POSibolt ERP config from AsyncLocalStorage.
 * Throws if called outside context or if tenant has no ERP config.
 */
export function getErpConfig(): PosiboltConfig {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error('[context] getErpConfig() called outside tenant context');
  }
  if (!ctx.erpConfig) {
    throw new Error('[context] Tenant has no ERP configuration — set it via admin API');
  }
  return ctx.erpConfig;
}

/**
 * Returns true if called within a tenant-authenticated request context.
 */
export function isTenantContext(): boolean {
  return tenantStorage.getStore() !== undefined;
}
