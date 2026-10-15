import { color, emitDocument, isJsonMode } from "../../../output";
import type { McpClient, McpClientTarget, McpServerEntry } from "../../../util/mcp-client-config";

/**
 * The emit-only path: print the block and where it belongs, and write nothing.
 *
 * The safe default for a file the caller may keep under version control — so
 * this function has no filesystem call in it at all, which is the property
 * worth being able to point at.
 */
export function printConfigBlock(
  client: McpClient,
  target: McpClientTarget,
  block: { mcpServers: Record<string, McpServerEntry> }
): void {
  if (isJsonMode()) {
    emitDocument({
      client,
      configPath: target.configPath,
      scope: target.scope,
      applied: false,
      config: block
    });
    return;
  }
  console.log(color.bold(`Add this to ${target.configPath}`));
  console.log(color.dim(`  scope: ${target.scope}`));
  console.log();
  console.log(JSON.stringify(block, null, 2));
  console.log();
  console.log(
    color.dim("Run the same command with --apply to write it there, then restart ") +
      color.cyan(client) +
      color.dim(".")
  );
}
