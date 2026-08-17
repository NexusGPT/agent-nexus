import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * WHERE AN MCP HOST KEEPS ITS SERVER LIST, AND HOW `nexus mcp install` EDITS IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ENTRY IS A COMMAND, WHICH IS WHY THERE IS NO KEY IN IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every host below launches a child process and speaks JSON-RPC to its stdio.
 * The block this module writes launches `nexus mcp serve`, so the credential the
 * bridge uses is the one the CLI already holds — there is no `env: { "…API_KEY":
 * "nxs_…" }` in it, and that absence is the point. The shape it replaces put a
 * live key in a JSON file that a project-scoped `.mcp.json` is routinely
 * committed to.
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

/** The MCP hosts `nexus mcp install` can write a block for. */
export const MCP_CLIENTS = ["claude-code", "claude-desktop", "cursor"] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];

/** Every host below keys its servers under this object. */
const SERVERS_KEY = "mcpServers";

export interface McpClientTarget {
  readonly client: McpClient;
  /** Absolute path of the file the block belongs in. */
  readonly configPath: string;
  /** What that file is, for a human reading the output. */
  readonly scope: string;
}

/**
 * Claude Desktop's config path, which is the only one that varies by platform.
 *
 * `APPDATA` rather than a constructed `C:\Users\…`: the variable is what the app
 * itself reads, and a roaming profile puts it somewhere else entirely.
 */
function claudeDesktopConfigPath(home: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

/**
 * Resolve where a client's block goes.
 *
 * `cwd` and `home` are parameters rather than reads of `process`, because the
 * spec beside this file drives every branch against a temporary directory —
 * a resolver that read the environment could only be tested on the machine that
 * happened to run it.
 */
export function resolveClientTarget(
  client: McpClient,
  opts: { cwd: string; home: string; platform: NodeJS.Platform }
): McpClientTarget {
  switch (client) {
    case "claude-code":
      return {
        client,
        configPath: path.join(opts.cwd, ".mcp.json"),
        scope: "this project (checked in beside your code)"
      };
    case "cursor":
      return {
        client,
        configPath: path.join(opts.home, ".cursor", "mcp.json"),
        scope: "your user account (every Cursor project)"
      };
    case "claude-desktop":
      return {
        client,
        configPath: claudeDesktopConfigPath(opts.home, opts.platform),
        scope: "your user account (the desktop app)"
      };
  }
}

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

/** What {@link applyServerEntry} did, so the caller reports it rather than guesses. */
export type ApplyOutcome = "created" | "added" | "replaced";

export class McpConfigConflictError extends Error {
  constructor(name: string, configPath: string) {
    super(
      `"${name}" is already configured in ${configPath}. ` +
        `Pass --force to replace it, or --name <other> to add a second entry.`
    );
    this.name = "McpConfigConflictError";
  }
}

export class McpConfigUnreadableError extends Error {
  constructor(configPath: string, cause: string) {
    super(
      `${configPath} exists and is not valid JSON (${cause}). ` +
        `Fix or move it — refusing to overwrite a file this command cannot read.`
    );
    this.name = "McpConfigUnreadableError";
  }
}

/**
 * Merge one server entry into a client's config file.
 *
 * 🚨 A MERGE, NEVER A WRITE OF THE BLOCK ALONE. These files hold the user's
 * other MCP servers and, for Claude Desktop, unrelated application settings.
 * Writing `{"mcpServers":{"nexus":…}}` over one deletes every other server the
 * user had configured, and nothing in the host's UI says where they went.
 *
 * An unparseable existing file is REFUSED rather than replaced, for the same
 * reason: this command cannot merge what it cannot read, and the alternative is
 * silently discarding a file whose contents the user still wants.
 */
export function applyServerEntry(
  configPath: string,
  name: string,
  entry: McpServerEntry,
  opts: { force: boolean }
): ApplyOutcome {
  let document: Record<string, unknown> = {};
  let existed = false;

  let raw: string | undefined;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    raw = undefined; // no file yet — a create, not a failure
  }

  if (raw !== undefined && raw.trim() !== "") {
    existed = true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new McpConfigUnreadableError(
        configPath,
        error instanceof Error ? error.message : String(error)
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new McpConfigUnreadableError(configPath, "top level is not a JSON object");
    }
    document = parsed as Record<string, unknown>;
  }

  const current = document[SERVERS_KEY];
  const servers: Record<string, unknown> =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};

  const replacing = name in servers;
  if (replacing && !opts.force) throw new McpConfigConflictError(name, configPath);

  servers[name] = entry;
  document[SERVERS_KEY] = servers;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(document, null, 2) + "\n");

  if (replacing) return "replaced";
  return existed ? "added" : "created";
}

/** The default `home` for the binary. Split out so a spec can hand its own. */
export function defaultHome(): string {
  return os.homedir();
}
