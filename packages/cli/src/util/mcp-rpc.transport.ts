import { HttpClient } from "@agent-nexus/sdk";

import { timeoutSecondsToMs } from "../client";
import { isCrossOrgToken } from "../commands/auth/_shared/token-prefixes";
import { resolveBaseUrl, resolveOrganization, resolveProfile } from "../config";
import { createApiDeprecationReporter } from "../route-deprecation-warnings";
import {
  type JsonRpcResponse,
  MCP_DEFAULT_TIMEOUT_MS,
  type McpTarget,
  type McpTransport,
  type McpTransportConfig
} from "./mcp-rpc.types";

/**
 * BUILDING the transport, and the two low-level concerns only it has: linking a
 * caller's abort signal to the SDK's own, and deciding whether what came back is
 * a JSON-RPC document at all. `mcp-rpc.ts`'s header owns why this speaks through
 * `HttpClient` and why it resolves the profile the same way `createClient` does.
 */

/** Path under the SDK's `/api/public/v1` prefix. */
const MCP_PATH = "/mcp";

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
        ...(signal ? { fetch: cancellableFetch } : {}),
        // `POST /mcp` is one route and is not deprecated today, so this wires a
        // channel rather than a message — which is the point: the client is
        // rebuilt PER MESSAGE here, so nothing on this path could ever learn of
        // a retirement unless the observer is installed at construction. The
        // dedupe lives in module scope in the CLI, so a long-lived
        // `nexus mcp serve` still warns once rather than once per message, and
        // stderr is the correct stream for a stdio bridge whose stdout carries
        // JSON-RPC.
        onDeprecation: createApiDeprecationReporter()
      });

      const data = await http.request<unknown>("POST", MCP_PATH, { body: message });
      // A notification returns 201 with an empty body, which `HttpClient` hands
      // back as `{}`. That is not a reply and must never be sent to a client as
      // one — an unmatched id breaks a stdio transport.
      return isJsonRpcResponse(data) ? data : null;
    }
  };
}
