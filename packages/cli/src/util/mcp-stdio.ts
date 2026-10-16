/**
 * THE STDIO FRAMING FOR `nexus mcp serve`, AND NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE FRAMING IS WRITTEN OUT RATHER THAN TAKEN FROM THE MCP SDK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * MCP's stdio transport is newline-delimited JSON-RPC: one message per line, no
 * embedded newlines, replies on stdout, everything else on stderr. That is the
 * whole specification of the layer, and it is the few dozen lines behind this
 * entry point.
 *
 * `@modelcontextprotocol/sdk` implements the same thing, and taking it would put
 * a dependency with its own transitive tree into a CLI whose only runtime
 * dependency is `commander` — for a byte-splitting loop this package can state
 * completely. The part that MUST NOT be re-implemented is the tool surface, and
 * it is not re-implemented anywhere: the catalog, its input schemas, scope
 * filtering and dispatch are all server-side and derived from the route
 * contracts. This family forwards bytes; it knows no tool names.
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer keeps one import path while each concern stays its own module. The
 * reasoning that used to sit in this header moved WITH the code it is about:
 *
 *   `.deps.ts`      what the bridge is handed, and why stdout belongs to the
 *                   protocol
 *   `.errors.ts`    the three reserved codes this layer can produce itself, and
 *                   reading an id off a message that may not have one
 *   `.inflight.ts`  the in-flight table, and why a cancellation is handled here
 *                   rather than forwarded
 *   `.dispatch.ts`  one line in, at most one reply out
 *   `.bridge.ts`    the newline framing and the drain on shutdown
 */

export { runStdioBridge } from "./mcp-stdio.bridge";
export type { StdioBridgeDeps } from "./mcp-stdio.deps";
