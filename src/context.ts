import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  keyId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Get the current tenant ID from AsyncLocalStorage.
 * Throws if called outside a tenant-authenticated request context.
 * Never returns undefined — use isTenantContext() first if unsure.
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
 * Returns true if called within a tenant-authenticated request context.
 */
export function isTenantContext(): boolean {
  return tenantStorage.getStore() !== undefined;
}
