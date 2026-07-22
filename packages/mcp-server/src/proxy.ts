import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import { resolveApiKey, resolveBaseUrl } from "./config";

// Per-message timeout. Without it a stalled backend makes a tool call hang
// forever, which Claude Code surfaces as the assistant silently stopping
// mid-response (NEX-1941). Override via NEXUS_MCP_REQUEST_TIMEOUT_MS.
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = "nexus-mcp/1.0.0";

function resolveTimeoutMs(): number {
  const raw = process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

export interface ProxyOptions {
  apiKey?: string;
  baseUrl?: string;
}

/** How the forwarder writes a reply back to the client. */
export type SendFn = (message: JSONRPCMessage) => void | Promise<void>;

// A message must be answered exactly when it carries an `id`; a notification has
// none and gets no reply. This mirrors the server's own request/notification
// rule, so the bridge stays faithful to it rather than reimplementing it.
function requestId(message: JSONRPCMessage): string | number | null | undefined {
  return "id" in message ? (message as { id: string | number | null }).id : undefined;
}

function isJsonRpc(value: unknown): value is JSONRPCMessage {
  return typeof value === "object" && value !== null && "jsonrpc" in value;
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function httpErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return `Nexus API rejected the request (HTTP ${status}). Check your API key or run: nexus-mcp login`;
  }
  const detail = body.slice(0, 300);
  return `Nexus API error (HTTP ${status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Build the function that forwards a single JSON-RPC message to the Nexus Public
 * API MCP endpoint and relays the reply through `send`.
 *
 * There is deliberately no tool logic here. The advertised tools, their input
 * schemas, scope filtering, validation and dispatch all live server-side and are
 * derived from the route contracts — this is only a transport bridge, so it can
 * never drift from the API the way a hand-written client mirror does.
 *
 * Kept separate from the stdio wiring so it can be exercised against a real HTTP
 * server without hijacking the process's stdio.
 */
export function createMcpForwarder(
  options?: ProxyOptions
): (message: JSONRPCMessage, send: SendFn) => Promise<void> {
  const baseUrl = (options?.baseUrl ?? resolveBaseUrl()).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/api/public/v1/mcp`;
  const timeoutMs = resolveTimeoutMs();

  // In-flight requests by id, so a `notifications/cancelled` can abort the
  // matching fetch and drop its now-unwanted reply. A late reply after a cancel
  // has broken stdio clients before, and leaving the fetch running means the user
  // cannot actually stop a long tool call.
  const inflight = new Map<
    string | number | null,
    { controller: AbortController; cancelled: boolean }
  >();

  // Cancel the in-flight request a `notifications/cancelled` targets. Handled
  // locally rather than forwarded: the API endpoint is stateless per request and
  // has no in-flight call to stop, exactly as the old in-process server dropped a
  // cancelled handler's result itself.
  function cancel(message: JSONRPCMessage): void {
    const target = (message as { params?: { requestId?: string | number } }).params?.requestId;
    if (target === undefined) return;
    const entry = inflight.get(target);
    if (entry) {
      entry.cancelled = true;
      entry.controller.abort();
    }
  }

  // Compute the reply for one message (or null for a notification / no-reply),
  // deliberately WITHOUT sending. Keeping the fetch/error mapping separate from
  // the single send() means a send failure (broken stdout, client disconnect)
  // can never cascade into a second reply for the same id.
  async function computeReply(message: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    const id = requestId(message);
    const asError = (code: number, text: string): JSONRPCMessage | null => {
      if (id === undefined) return null;
      // A JSON-RPC error echoes the request id verbatim. `id` is string | number
      // over stdio (the SDK rejects a null id at parse), but a direct caller may
      // pass null, which JSON-RPC permits on an error — assert the wider shape at
      // this one boundary.
      return { jsonrpc: "2.0", id, error: { code, message: text } } as JSONRPCMessage;
    };

    // Resolve the key per message so a `nexus-mcp login` mid-session takes effect
    // without a restart, and a missing key is reported on the request instead of
    // crashing the bridge.
    let apiKey: string;
    try {
      apiKey = options?.apiKey ?? resolveApiKey();
    } catch (error) {
      return asError(-32001, error instanceof Error ? error.message : String(error));
    }

    const entry = { controller: new AbortController(), cancelled: false };
    if (id !== undefined) inflight.set(id, entry);
    const timer = setTimeout(() => entry.controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
          "user-agent": USER_AGENT
        },
        body: JSON.stringify(message),
        signal: entry.controller.signal
      });

      // Notification: the endpoint returns an empty body and the client expects
      // no reply.
      if (id === undefined) return null;

      const text = await response.text();
      const payload = safeJson(text);
      if (response.ok && isJsonRpc(payload)) return payload;
      // A non-2xx or non-JSON-RPC body (a 403 from the api-key guard, a 5xx) must
      // not reach the client as a malformed message — surface the status as a
      // JSON-RPC error instead.
      return asError(-32002, httpErrorMessage(response.status, text));
    } catch (error) {
      // A cancelled request is dropped silently — the client asked us to stop and
      // a late reply can break its transport.
      if (entry.cancelled) return null;
      const timedOut = entry.controller.signal.aborted;
      return asError(
        timedOut ? -32003 : -32603,
        timedOut
          ? `Nexus API request timed out after ${timeoutMs}ms`
          : `nexus-mcp proxy error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timer);
      if (id !== undefined) inflight.delete(id);
    }
  }

  return async function forward(message: JSONRPCMessage, send: SendFn): Promise<void> {
    if (
      requestId(message) === undefined &&
      (message as { method?: string }).method === "notifications/cancelled"
    ) {
      cancel(message);
      return;
    }
    const reply = await computeReply(message);
    if (reply) await send(reply);
  };
}

/**
 * Start a stdio MCP server that bridges to the Nexus Public API MCP endpoint.
 * Reads JSON-RPC over stdio and forwards every message to the API.
 */
export async function startStdioProxy(options?: ProxyOptions): Promise<void> {
  const forward = createMcpForwarder(options);
  const transport = new StdioServerTransport();
  transport.onmessage = (message) => {
    // Fire-and-forget per message; a failure to deliver the reply (broken stdout)
    // is unrecoverable for this message, so log it rather than leaving an
    // unhandled rejection.
    forward(message, (reply) => transport.send(reply)).catch((error) => {
      console.error(
        "nexus-mcp: failed to handle message:",
        error instanceof Error ? error.message : error
      );
    });
  };
  await transport.start();
}
