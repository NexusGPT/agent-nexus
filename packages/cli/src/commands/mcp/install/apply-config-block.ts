import { reportFailure } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  applyServerEntry,
  type McpClient,
  type McpClientTarget,
  type McpServerEntry
} from "../../../util/mcp-client-config";

/**
 * The `--apply` path: merge the entry into the host's config file and report
 * what happened to it.
 */
export function applyConfigBlock(
  client: McpClient,
  target: McpClientTarget,
  name: string,
  entry: McpServerEntry,
  force: boolean
): void {
  let outcome;
  try {
    outcome = applyServerEntry(target.configPath, name, entry, { force });
  } catch (error) {
    // `local-failed` is the cause this is, and the generic handler would
    // label it `CLI_UNKNOWN_ERROR` — a code that tells a script nothing
    // about whether the request even happened. Nothing left this process:
    // a name collision, an unreadable file, or a directory this user
    // cannot write are all failures of a write on THIS machine.
    process.exitCode = reportFailure(
      "local-failed",
      error instanceof Error ? error.message : String(error),
      `Config file: ${target.configPath}`
    );
    return;
  }

  printSuccess(`MCP server "${name}" ${outcome} in ${target.configPath}.`, {
    client,
    configPath: target.configPath,
    server: name,
    command: `${entry.command} ${entry.args.join(" ")}`,
    outcome
  });
}
