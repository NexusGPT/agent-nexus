import fs from "node:fs";
import path from "node:path";

import { type McpServerEntry, SERVERS_KEY } from "./mcp-client-config.block";
import { McpConfigConflictError, McpConfigUnreadableError } from "./mcp-client-config.errors";

/** What {@link applyServerEntry} did, so the caller reports it rather than guesses. */
export type ApplyOutcome = "created" | "added" | "replaced";

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
