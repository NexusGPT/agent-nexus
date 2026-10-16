import type { JsonRpcMessage, JsonRpcResponse, McpTransport } from "./mcp-rpc.types";

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
