import type { NexusClient } from "@agent-nexus/sdk";

/**
 * The two wire shapes `mcpServers.callTool` has, DERIVED from the shipping client
 * rather than re-declared.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THEY ARE DERIVED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The SDK does not export either shape from its public surface, so the obvious
 * spelling here is a hand-written interface listing the fields this namespace
 * touches. That is a REPLICA: it compiles for ever, and it goes on compiling after
 * the SDK drops, renames or re-requires a field, because nothing compares the two.
 * `Awaited<ReturnType<…>>` and `Parameters<…>[1]` make `tsc` the comparison — a
 * field that leaves the SDK leaves these types with it, and every reader reds.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY IT IS A LEAF
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three siblings need these — `call-body.ts`, `call-failure.ts` and
 * `call-render.ts` — and declaring them in any one would make the others import
 * across. `import/no-cycle` is armed on this package through
 * `packages/config/eslint/base-flat.js`, and a shared type declared in a sibling
 * rather than a leaf is how that starts.
 */

/** What a successful `callTool` resolves to. */
export type McpCallResult = Awaited<ReturnType<NexusClient["mcpServers"]["callTool"]>>;

/** The request body `callTool` takes, after the server id positional. */
export type McpCallBody = Parameters<NexusClient["mcpServers"]["callTool"]>[1];
