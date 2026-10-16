import type { Seconds } from "../client";
import type { ProfileSource } from "../config";

/**
 * THE WIRE VOCABULARY of `POST /api/public/v1/mcp` — the JSON-RPC documents, the
 * descriptors the endpoint answers with, and what the transport resolved.
 *
 * A LEAF: it imports two types and nothing else, so the transport, the bridge
 * and the readers can each name a shape without depending on one another.
 * `mcp-rpc.ts` is the public name for all four and declares nothing itself.
 */

/**
 * How long one JSON-RPC message may take when `--timeout` is not given.
 * MILLISECONDS — the unit `HttpClient.timeout` speaks.
 *
 * 60s rather than the SDK's 30s default because a `tools/call` dispatches a real
 * Public API request behind the endpoint, so its budget is a full API call plus
 * the loopback hop. The `*_MS` suffix is the convention
 * `timeout-unit-is-in-the-type.test.ts` reads.
 *
 * ⚠️ `mcp serve --help` STATES this number, and states it by interpolating this
 * constant rather than typing 60. A help screen that names a default the code no
 * longer uses is the defect this package's docs gates exist to catch, and a
 * hand-typed one goes stale in silence.
 */
export const MCP_DEFAULT_TIMEOUT_MS = 60_000;

/** The same default in the unit `--timeout` speaks. A display divide, never a deadline. */
export const MCP_DEFAULT_TIMEOUT_SECONDS = MCP_DEFAULT_TIMEOUT_MS / 1000;

/** A JSON-RPC 2.0 request or notification. A notification carries no `id`. */
export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** A JSON-RPC 2.0 response. Exactly one of `result` / `error` is present. */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** One entry of a `tools/list` result, as the server sends it. */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** The `tools/call` result shape the endpoint returns. */
export interface McpCallResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

export interface McpTransportConfig {
  /** Global `--api-key`. */
  apiKey?: string;
  /** Global `--base-url`. */
  baseUrl?: string;
  /** Global `--profile`. */
  profile?: string;
  /** Global `--timeout`, in SECONDS. */
  timeout?: Seconds;
}

/** What the transport resolved, for the surfaces that must report it. */
export interface McpTarget {
  /** Full URL, for `--help`-grade diagnostics and for `mcp install`. */
  readonly url: string;
  readonly profileName: string;
  readonly profileSource: ProfileSource;
  /** The organization the `organization-id` header names, when one is selected. */
  readonly organizationId?: string;
  /**
   * True when the key is org-unbound (`nxs_p_` / `nxs_o_`), so with no
   * `organization-id` selected the SERVER picks the tenant. An org-scoped key
   * answers from its own org instead — the same blank banner means two very
   * different things, and only one of them is the wrong-tenant failure this
   * diagnostic exists to surface.
   */
  readonly keyIsCrossOrg: boolean;
}

export interface McpTransport {
  readonly target: McpTarget;
  /**
   * Forward one JSON-RPC message and return the reply, or `null` when the
   * message was a notification (the endpoint answers 201 with no body).
   *
   * Throws the SDK's own error types on a transport or HTTP failure, so a caller
   * hands them straight to `handleError`.
   */
  send(message: JsonRpcMessage, signal?: AbortSignal): Promise<JsonRpcResponse | null>;
}
