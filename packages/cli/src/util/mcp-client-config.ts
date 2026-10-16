/**
 * WHERE AN MCP HOST KEEPS ITS SERVER LIST, AND HOW `nexus mcp install` EDITS IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ENTRY IS A COMMAND, WHICH IS WHY THERE IS NO KEY IN IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every host below launches a child process and speaks JSON-RPC to its stdio.
 * The block this family writes launches `nexus mcp serve`, so the credential the
 * bridge uses is the one the CLI already holds — there is no `env: { "…API_KEY":
 * "nxs_…" }` in it, and that absence is the point.
 *
 * It is a MERGE and never a write of the block alone: these files hold the
 * user's other MCP servers, and an unparseable one is refused rather than
 * replaced.
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer keeps one import path while each concern stays its own module. The
 * reasoning that used to sit in this header moved WITH the code it is about:
 *
 *   `.clients.ts`  the hosts this command knows
 *   `.target.ts`   which file each host's block belongs in, per platform
 *   `.block.ts`    the launch entry, the pasteable document, and why the
 *                  profile is pinned by default
 *   `.errors.ts`   the two refusals, each naming its repair
 *   `.apply.ts`    merging one entry into a host's file without losing the rest
 */

export { type ApplyOutcome, applyServerEntry } from "./mcp-client-config.apply";
export { buildConfigBlock, buildServerEntry, type McpServerEntry } from "./mcp-client-config.block";
export { MCP_CLIENTS, type McpClient } from "./mcp-client-config.clients";
export { McpConfigConflictError, McpConfigUnreadableError } from "./mcp-client-config.errors";
export { defaultHome, type McpClientTarget, resolveClientTarget } from "./mcp-client-config.target";
