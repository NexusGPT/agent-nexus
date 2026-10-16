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
 * So `mcp-rpc.transport.ts` resolves the profile through `resolveProfile` and
 * the organization through `resolveOrganization` — the SAME two functions
 * `createClient` uses for every other command — and every `nexus mcp` leaf,
 * including the stdio bridge, goes through it. Profile parity is then a property
 * of the code path rather than a promise.
 *
 * ── THE FAMILY ──────────────────────────────────────────────────────────────
 *
 * This file is the PUBLIC NAME and declares nothing. Every import in the package
 * names this path; the four leaves behind it are `mcp-rpc.types.ts` (the wire
 * vocabulary, importing nothing of its own), `mcp-rpc.transport.ts` (resolution
 * and one message out), `mcp-rpc.bridge.ts` (the stdio forwarder's reply rule)
 * and `mcp-rpc.messages.ts` (the two requests and the three readers). No leaf
 * imports this file back, so `import/no-cycle` has nothing to report.
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

export { createBridgeForwarder } from "./mcp-rpc.bridge";
export {
  readCallPayload,
  readCallResult,
  readToolList,
  toolsCallMessage,
  toolsListMessage
} from "./mcp-rpc.messages";
export { createMcpTransport } from "./mcp-rpc.transport";
export {
  type JsonRpcMessage,
  type JsonRpcResponse,
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_DEFAULT_TIMEOUT_SECONDS,
  type McpCallResult,
  type McpTarget,
  type McpToolDescriptor,
  type McpTransport,
  type McpTransportConfig
} from "./mcp-rpc.types";
