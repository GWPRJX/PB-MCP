/**
 * MCP tool response helpers.
 *
 * All 21 MCP tools return responses using these two helpers.
 * Never throw from a tool handler — always return toolError() on failure.
 * This keeps MCP error protocol correct: isError: true with structured body.
 */

import { recordToolCall } from '../admin/audit-service.js';
import { tenantStorage } from '../context.js';

/**
 * Check whether a tool should be registered given the filter set.
 * If filter is null/undefined, all tools are registered.
 */
export function shouldRegister(toolName: string, filter: Set<string> | null | undefined): boolean {
  return !filter || filter.has(toolName);
}

export type ErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'INTERNAL_ERROR';

export interface ToolErrorBody {
  code: ErrorCode;
  message: string;
  field?: string;
}

/**
 * Return an MCP error result.
 * @param code   Machine-readable error code
 * @param message Human-readable message
 * @param field  Optional field name for INVALID_INPUT errors
 */
export function toolError(code: ErrorCode, message: string, field?: string) {
  const body: ToolErrorBody = { code, message };
  if (field !== undefined) body.field = field;
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
  };
}

/**
 * Return a successful MCP result containing JSON-serialized data.
 * @param data Any JSON-serializable object
 */
export function toolSuccess(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

/**
 * Wrap an MCP tool handler with fire-and-forget audit logging.
 *
 * Records tool_name, params, status, error message, and duration to the
 * audit_log table via recordToolCall. Silently skips if called outside a
 * tenant context (e.g. during tool discovery).
 *
 * The generic type parameter preserves the original handler's exact signature
 * so that the MCP SDK's overload resolution still works (literal types, etc.).
 *
 * @param toolName  The registered MCP tool name (e.g. 'list_products')
 * @param handler   The original tool handler function
 * @returns         A new handler with the same signature
 */
export function withAudit<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  handler: T,
): T {
  const wrapped = async (...args: any[]) => {
    const startTime = Date.now();
    const result = await handler(...args);
    const durationMs = Date.now() - startTime;

    const ctx = tenantStorage.getStore();
    if (ctx) {
      const status = result.isError ? 'error' : 'success';
      const errorMessage = result.isError
        ? result.content?.[0]?.text
        : undefined;

      // Fire-and-forget — recordToolCall handles its own errors internally
      recordToolCall(
        ctx.tenantId,
        ctx.keyId,
        toolName,
        args[0] ?? {},
        status,
        errorMessage,
        durationMs,
      );
    }

    return result;
  };
  return wrapped as T;
}
