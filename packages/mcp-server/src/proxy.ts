import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import { resolveApiKey, resolveBaseUrl, resolveOrganizationId } from "./config";

// Per-message timeout. Without it a stalled backend makes a tool call hang
// forever, which Claude Code surfaces as the assistant silently stopping
// mid-response (NEX-1941). Override via NEXUS_MCP_REQUEST_TIMEOUT_MS.
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * The deadline for a tool whose route runs a MODEL before it can answer.
 *
 * 60 s is right for the bridge's ordinary traffic — a stalled backend should
 * not hold a tool call open — and wrong for the handful of tools that cannot
 * answer until a generation finishes. `skills_execute_task` on a frontier model
 * with structured JSON output takes 60–90 s, so the default landed on the wrong
 * side of it: the call failed as "timed out" while the server ran to completion
 * and billed the generation (NEX-2492).
 *
 * Ten minutes, matching the SDK's `LONG_RUNNING_TIMEOUT_MS`, so hitting this
 * means something is genuinely wrong rather than merely slow.
 */
export const LONG_RUNNING_TOOL_TIMEOUT_MS = 600_000;

/**
 * The tools whose route runs a model, or waits on a third party that may itself
 * run one, before the API can answer at all.
 *
 * Names are the `mcp.name` the route contracts declare in
 * `@nexus/types` — the bridge deliberately carries no dependency on that
 * package (it is a transport, and stays dependency-light), so
 * `proxy.test.ts` reads the contracts from source and fails if a name here
 * stops matching one there.
 */
export const LONG_RUNNING_TOOLS: ReadonlySet<string> = new Set([
  "skills_execute_task",
  "tools_execute"
]);

/**
 * The bridge's own deadline, or `undefined` when the operator has stated none.
 *
 * Kept unresolved so "the operator asked for 60 s" and "nobody said anything"
 * stay distinguishable: an explicit `NEXUS_MCP_REQUEST_TIMEOUT_MS` governs every
 * message, long-running tools included, and that is the point of setting it.
 *
 * An UNPARSEABLE or non-positive value is `undefined` here, i.e. treated as
 * unset rather than as 60 s. `NEXUS_MCP_REQUEST_TIMEOUT_MS=abc` is not a stated
 * ceiling, and reading it as one would put the flat default back in front of the
 * tools this exemption exists for.
 */
function resolveConfiguredTimeoutMs(): number | undefined {
  const raw = process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** The tool a `tools/call` message invokes, or `undefined` for anything else. */
function calledToolName(message: JSONRPCMessage): string | undefined {
  if ((message as { method?: string }).method !== "tools/call") return undefined;
  const name = (message as { params?: { name?: unknown } }).params?.name;
  return typeof name === "string" ? name : undefined;
}

/**
 * How long to wait on one message.
 *
 * @param message - The JSON-RPC message about to be forwarded.
 * @param configuredMs - `NEXUS_MCP_REQUEST_TIMEOUT_MS`, when the operator set
 *   one. It governs EVERY message, long-running tools included: an explicit
 *   ceiling that a per-tool default silently outlived would not be a ceiling.
 */
export function requestTimeoutMs(message: JSONRPCMessage, configuredMs?: number): number {
  if (configuredMs !== undefined) return configuredMs;
  const tool = calledToolName(message);
  return tool !== undefined && LONG_RUNNING_TOOLS.has(tool)
    ? LONG_RUNNING_TOOL_TIMEOUT_MS
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

const USER_AGENT = "nexus-mcp/1.0.0";

export interface ProxyOptions {
  apiKey?: string;
  baseUrl?: string;
  /**
   * Organization to act on, sent as `organization-id`.
   *
   * Resolved per message from {@link resolveOrganizationId} when omitted. An
   * org-unbound key acts on NO organization without it — see that function for
   * what the omission cost.
   */
  organizationId?: string;
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
    return (
      `Nexus API rejected the request (HTTP ${status}). Check your API key and the ` +
      `organization it acts on — run "nexus auth status", or "nexus-mcp login" to store a key here.`
    );
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
  const configuredTimeoutMs = resolveConfiguredTimeoutMs();

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

    // Resolved beside the key and for the same reason: `nexus auth use-org`
    // mid-session must take effect without a restart. Absent when the key is
    // org-scoped and nothing selected an organization, which is the ordinary
    // case — an EMPTY header is not the same as no header, and sending one would
    // be refused rather than defaulted.
    const organizationId = options?.organizationId ?? resolveOrganizationId();

    const entry = { controller: new AbortController(), cancelled: false };
    if (id !== undefined) inflight.set(id, entry);
    const timeoutMs = requestTimeoutMs(message, configuredTimeoutMs);
    const timer = setTimeout(() => entry.controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
          "user-agent": USER_AGENT,
          ...(organizationId ? { "organization-id": organizationId } : {})
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
