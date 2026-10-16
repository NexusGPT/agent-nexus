import type { JsonRpcResponse } from "./mcp-rpc";

/**
 * The error replies this layer can produce on its own, and the two id readings
 * a malformed message needs.
 */

/** JSON-RPC 2.0 reserved codes this layer can produce on its own. */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const INTERNAL_ERROR = -32603;

export function errorReply(
  id: string | number | null,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** `id` is ABSENT on a notification, which is a different thing from `id: null`. */
export function hasId(message: unknown): boolean {
  return typeof message === "object" && message !== null && "id" in message;
}

export function idOf(message: unknown): string | number | null {
  const raw = (message as { id?: unknown }).id;
  return typeof raw === "string" || typeof raw === "number" ? raw : null;
}
