/**
 * THE ENTRY IS A COMMAND, WHICH IS WHY THERE IS NO KEY IN IT.
 *
 * Every host this family writes for launches a child process and speaks
 * JSON-RPC to its stdio. The block built here launches `nexus mcp serve`, so the
 * credential the bridge uses is the one the CLI already holds — there is no
 * `env: { "…API_KEY": "nxs_…" }` in it, and that absence is the point. The shape
 * it replaces put a live key in a JSON file that a project-scoped `.mcp.json` is
 * routinely committed to.
 *
 * ── WHY THE PROFILE IS PINNED BY DEFAULT ────────────────────────────────────
 *
 * The active profile is MACHINE-GLOBAL state: `nexus auth switch` in any
 * terminal repoints every process that has no binding of its own, silently. An
 * MCP server configured to follow it would change organization under a running
 * editor, mid-session, with nothing in the UI to say so — reads answer from the
 * other organization and writes LAND in it. So the emitted args carry
 * `--profile <name>` unless `--no-pin` is passed, which turns level 6 into
 * level 2 and makes the host's binding immune to what another terminal does.
 */

/**
 * Every host this family writes for keys its servers under this object.
 *
 * Declared here and imported by the merge beside it, so the two cannot drift
 * onto different keys.
 */
export const SERVERS_KEY = "mcpServers";

/** The launch block for one server entry. */
export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
}

/** Build the entry that launches this CLI's own bridge. */
export function buildServerEntry(opts: {
  /** Profile to pin, or `undefined` to follow whatever is active at launch. */
  readonly profile?: string;
  /** `--base-url`, when the host must reach an environment other than the default. */
  readonly baseUrl?: string;
}): McpServerEntry {
  const args = ["mcp", "serve"];
  if (opts.profile) args.push("--profile", opts.profile);
  if (opts.baseUrl) args.push("--base-url", opts.baseUrl);
  return { command: "nexus", args };
}

/** The full document a caller pastes, for the emit-only path. */
export function buildConfigBlock(
  name: string,
  entry: McpServerEntry
): { mcpServers: Record<string, McpServerEntry> } {
  return { [SERVERS_KEY]: { [name]: entry } };
}
