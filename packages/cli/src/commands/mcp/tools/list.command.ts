import type { Command } from "commander";

import { handleError } from "../../../errors";
import { printTable } from "../../../output";
import { createMcpTransport } from "../../../util/mcp-rpc";
import { listTools } from "../_shared/rpc-request";

/** `nexus mcp tools list` */
export function registerMcpToolsListCommand(tools: Command, program: Command): void {
  tools
    .command("list")
    .description("List the MCP tools the current API key exposes")
    .option("--filter <text>", "Only tools whose name or description contains this text")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools list --filter workflow
  $ nexus mcp tools list --json
  $ nexus mcp tools list --profile prod

Notes:
  THE LIST IS ALREADY SCOPE-FILTERED BY THE SERVER, so its length is a statement
  about YOUR KEY and not about the platform. A different key on the same
  organization legitimately sees a different catalog, and a tool that is absent
  is a scope you do not hold far more often than a route that does not exist.
  --filter IS APPLIED IN THIS PROCESS, after the full catalog arrives. It is a
  plain case-insensitive substring test over the name and the description — not a
  glob, not a regex — and it narrows what is PRINTED, never what the key can do.
  THE DESCRIPTION COLUMN IS TRUNCATED TO ITS WIDTH, like every table in this CLI.
  Read --json, or "nexus mcp tools get <tool>", before concluding a description
  says something it does not.
  READ-ONLY AND DESTRUCTIVE ARE HINTS DERIVED FROM THE HTTP VERB behind the tool,
  not a permission check. "destructive: yes" means a caller should confirm before
  invoking it; it does not mean the endpoint will refuse you, and "no" is not a
  promise that nothing changes.
  AN EMPTY LIST IS NOT AN ERROR and exits 0. It means the key holds no scope that
  reaches an MCP-exposed route.`
    )
    .action(async (opts: { filter?: string }) => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const all = await listTools(transport);
        if (all === undefined) return;

        const needle = opts.filter?.toLowerCase();
        const rows = (
          needle
            ? all.filter(
                (tool) =>
                  tool.name.toLowerCase().includes(needle) ||
                  (tool.description ?? "").toLowerCase().includes(needle)
              )
            : all
        ).map((tool) => ({
          name: tool.name,
          readOnly: tool.annotations?.readOnlyHint === true,
          destructive: tool.annotations?.destructiveHint === true,
          description: tool.description ?? ""
        }));

        printTable(rows, [
          { key: "name", label: "TOOL", width: 34 },
          { key: "readOnly", label: "READ-ONLY", width: 9 },
          { key: "destructive", label: "DESTRUCTIVE", width: 11 },
          { key: "description", label: "DESCRIPTION", width: 60 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
