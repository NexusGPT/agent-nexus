import { HttpClient } from "@agent-nexus/sdk";

import { type Seconds, timeoutSecondsToMs } from "../client";
import { isCrossOrgToken } from "../commands/auth";
import { type ProfileSource, resolveBaseUrl, resolveOrganization, resolveProfile } from "../config";

/**
 * ONE WAY TO SPEAK TO `POST /api/public/v1/mcp`, FOR EVERY `nexus mcp` LEAF.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CLI MODULE AND NOT A SECOND CREDENTIAL STORE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The outbound MCP surface used to be reachable only through the separate npm
 * package `@agent-nexus/mcp-server`, whose `nexus-mcp login` resolves a key of
 * its own: `NEXUS_API_KEY`, else the ACTIVE profile, and nothing else. That is
 * strictly less than this CLI's resolution — no `--profile`, no `NEXUS_PROFILE`,
 * no `.nexusrc`, and, the one that silently returns another tenant's data, NO
 * `organization-id` HEADER.
 *
 * That last gap is not cosmetic. A personal cross-org token (`nxs_p_`) carries
 * no organization of its own; the org is chosen by the header this CLI sends and
 * `nexus auth use-org` stores. The bridge never sent it, so every MCP tool call
 * made under a cross-org key acted on whichever organization the SERVER picked
 * by default — while `nexus agent list` in the same terminal, holding the same
 * key, acted on the one the operator selected. Two surfaces, one credential, two
 * different tenants, and nothing on either side said so.
 *
 * So this module resolves the profile through {@link resolveProfile} and the
 * organization through {@link resolveOrganization} — the SAME two functions
 * `createClient` uses for every other command — and every `nexus mcp` leaf,
 * including the stdio bridge, goes through it. Profile parity is then a property
 * of the code path rather than a promise.
 *
 * ── WHY `HttpClient` AND NOT A BARE `fetch` ─────────────────────────────────
 *
 * `POST /mcp` answers a JSON-RPC 2.0 document, and NestJS answers a POST with
 * 201. A hand-rolled client has to get both right — plus the empty 201 body a
 * JSON-RPC *notification* legitimately produces — and getting the first one
 * wrong is precisely NEX-3021, which made this endpoint unreachable from
 * `nexus api` for months. `HttpClient` already encodes all three, and its
 * transport failures arrive as the SDK error types `handleError` classifies, so
 * a `nexus mcp` failure produces the same `{"error":{…}}` document with the same
 * `code` as every other command.
 *
 * POST is not in the SDK's idempotent set, so nothing here is ever replayed —
 * a retried `tools/call` would run the tool twice.
 */

/** Path under the SDK's `/api/public/v1` prefix. */
const MCP_PATH = "/mcp";

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

/**
 * Combine two abort signals into one.
 *
 * `AbortSignal.any` does this natively and arrived in Node 20.3; this package
 * declares `engines.node >= 18`, so the native call would throw
 * `AbortSignal.any is not a function` on a supported runtime — at the moment a
 * user cancels a tool call, which is the worst possible time to discover it.
 */
function linkSignals(a: AbortSignal | null | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  const controller = new AbortController();
  for (const signal of [a, b]) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** Does this look like the JSON-RPC document the endpoint promised? */
function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return typeof value === "object" && value !== null && "jsonrpc" in value;
}

/**
 * Build the transport for one invocation.
 *
 * Resolution happens HERE rather than per message: one `nexus` process runs one
 * command, and a bridge that re-read the active profile mid-session would change
 * organization under a running MCP client without telling it. `mcp serve --help`
 * states that, so the behaviour is documented where the reader is.
 */
export function createMcpTransport(config: McpTransportConfig = {}): McpTransport {
  const resolved = resolveProfile(config);
  const { organizationId } = resolveOrganization(resolved.profile);
  const apiKey = config.apiKey ?? resolved.profile.apiKey;
  const baseUrl = resolveBaseUrl(config.baseUrl, config.profile);
  const timeout = timeoutSecondsToMs(config.timeout) ?? MCP_DEFAULT_TIMEOUT_MS;

  const target: McpTarget = {
    url: `${baseUrl.replace(/\/+$/, "")}/api/public/v1${MCP_PATH}`,
    profileName: resolved.name,
    profileSource: resolved.source,
    keyIsCrossOrg: apiKey !== undefined && isCrossOrgToken(apiKey),
    ...(organizationId ? { organizationId } : {})
  };

  return {
    target,
    async send(message, signal) {
      // Typed as the global `fetch` rather than annotated per parameter, so the
      // shape stays the SDK's own `HttpClientOptions["fetch"]` and no cast is
      // needed to hand it over.
      const cancellableFetch: typeof globalThis.fetch = (input, init) =>
        globalThis.fetch(input, {
          ...init,
          signal: signal ? linkSignals(init?.signal, signal) : init?.signal
        });

      // A fresh client per message, because the ONLY way to hand `HttpClient` a
      // caller-owned abort signal is through its injectable `fetch`, and that is
      // fixed at construction. Constructing one assigns eight fields and opens
      // nothing, so this is a closure, not a connection.
      const http = new HttpClient({
        baseUrl,
        apiKey,
        timeout,
        maxRetries: 0,
        ...(organizationId ? { defaultHeaders: { "organization-id": organizationId } } : {}),
        ...(signal ? { fetch: cancellableFetch } : {})
      });

      const data = await http.request<unknown>("POST", MCP_PATH, { body: message });
      // A notification returns 201 with an empty body, which `HttpClient` hands
      // back as `{}`. That is not a reply and must never be sent to a client as
      // one — an unmatched id breaks a stdio transport.
      return isJsonRpcResponse(data) ? data : null;
    }
  };
}

/**
 * The upstream-failure code, kept from `@agent-nexus/mcp-server`.
 *
 * Not a JSON-RPC reserved code — the reserved range stops at -32000 — so it is
 * this bridge's own, and it is the one the standalone package has answered an
 * upstream HTTP failure with since it shipped. Keeping it means a host that
 * branches on the code is unaffected by moving to `nexus mcp serve`.
 */
const UPSTREAM_FAILED = -32002;

/**
 * The per-message forwarder `nexus mcp serve` hands the stdio bridge.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A REQUEST IS OWED EXACTLY ONE REPLY, AND `null` IS NOT ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link McpTransport.send} answers `null` for two different things: a
 * NOTIFICATION, which correctly gets no reply, and a 2xx whose body is empty or
 * is not a JSON-RPC document — a gateway's 204, a proxy interstitial. Passing
 * the second through as "no reply" leaves a request id unanswered forever, and
 * the host has no timeout of its own for it: the user sees the assistant stop
 * mid-response and nothing is logged anywhere. That is the failure NEX-1941
 * already cost once.
 *
 * So the presence of `id` decides whether a reply is owed, never the shape of
 * the body. A failure of any kind — transport, timeout, or an answer that is not
 * a JSON-RPC document — becomes a JSON-RPC error on that id, and the session
 * stays open for every other message in flight.
 *
 * Lives here rather than inline in the command so it can be driven directly: the
 * cases that matter are the ones a running host cannot report.
 */
export function createBridgeForwarder(
  transport: McpTransport
): (message: JsonRpcMessage, signal: AbortSignal) => Promise<JsonRpcResponse | null> {
  return async (message, signal) => {
    const owedAReply = "id" in message;
    const asError = (text: string): JsonRpcResponse | null =>
      owedAReply
        ? {
            jsonrpc: "2.0",
            id: message.id ?? null,
            error: { code: UPSTREAM_FAILED, message: text }
          }
        : null;

    try {
      const reply = await transport.send(message, signal);
      // Sent, then dropped — and dropped WITHOUT looking at the body, because a
      // notification is owed nothing whatever the endpoint chose to answer with.
      // It does not always answer empty: a notification whose envelope fails the
      // endpoint's schema (`method: ""`, a bad `jsonrpc`) is refused with a
      // JSON-RPC error document on the null id, and returning that would put an
      // unmatched reply on stdout for a message the host never expects one for.
      // `createMcpForwarder` in `@agent-nexus/mcp-server` returns here too.
      if (!owedAReply) return null;
      if (reply !== null) return reply;
      return asError(
        `The Nexus API answered without a JSON-RPC reply for method "${message.method}".`
      );
    } catch (error) {
      return asError(
        `Nexus API request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

/** The `tools/list` request, with the id the caller wants echoed back. */
export function toolsListMessage(id: number): JsonRpcMessage {
  return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

/** The `tools/call` request for one tool and its arguments. */
export function toolsCallMessage(
  id: number,
  name: string,
  args: Record<string, unknown>
): JsonRpcMessage {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

/**
 * Read the tools out of a `tools/list` result.
 *
 * Defensive about the shape rather than casting: this is a live endpoint whose
 * catalog is generated server-side, and a caller that trusted the cast would
 * print `undefined` rows instead of saying the response was not what it claimed.
 */
export function readToolList(result: unknown): McpToolDescriptor[] | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return undefined;
  return tools.filter(
    (tool): tool is McpToolDescriptor =>
      typeof tool === "object" &&
      tool !== null &&
      typeof (tool as McpToolDescriptor).name === "string"
  );
}

/**
 * Read a `tools/call` result without asserting its shape.
 *
 * A cast here would be a claim about a live endpoint rather than a check of it,
 * and the field it matters most for is `isError`: a cast turns "the server sent
 * something we did not expect" into "the tool succeeded", which is the one wrong
 * answer a caller cannot detect. Anything that is not a `true` boolean is
 * therefore NOT an error, and anything that is not an array of blocks is no
 * content — both stated, rather than assumed.
 */
export function readCallResult(value: unknown): McpCallResult {
  if (typeof value !== "object" || value === null) return {};
  const record = value as { content?: unknown; isError?: unknown };
  const content = Array.isArray(record.content)
    ? record.content.filter(
        (block): block is { type: string; text?: string } =>
          typeof block === "object" &&
          block !== null &&
          typeof (block as { type?: unknown }).type === "string"
      )
    : undefined;
  return {
    ...(content ? { content } : {}),
    ...(record.isError === true ? { isError: true } : {})
  };
}

/**
 * The single text block a `tools/call` result carries, parsed when it is JSON.
 *
 * The endpoint answers `content: [{ type: "text", text: JSON.stringify(data) }]`
 * — the payload is a JSON document inside a string. Returning it re-parsed is
 * what makes `nexus mcp call agent_list | jq '.data[0].id'` work; `--raw` is
 * there for the caller who wants the envelope instead.
 */
export function readCallPayload(result: McpCallResult): unknown {
  const texts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
  }
  // Collected as strings rather than filtered-then-cast: `Array.prototype.filter`
  // does not narrow the element type, so the cast that spelling needs would be
  // an assertion about the same data this function exists to be careful with.
  if (texts.length !== 1) return result;
  try {
    return JSON.parse(texts[0]);
  } catch {
    return texts[0];
  }
}
