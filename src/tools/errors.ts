/**
 * MCP tool response helpers.
 *
 * All 18 ERP tools return responses using these two helpers.
 * Never throw from a tool handler — always return toolError() on failure.
 * This keeps MCP error protocol correct: isError: true with structured body.
 */

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
