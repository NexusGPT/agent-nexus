import type { Command } from "commander";

import { handleError, reportFailure } from "../../../errors";
import { color, emitDocument, isJsonMode } from "../../../output";
import { createMcpTransport } from "../../../util/mcp-rpc";
import { listTools } from "../_shared/rpc-request";

/** `nexus mcp tools get` */
export function registerMcpToolsGetCommand(tools: Command, program: Command): void {
  tools
    .command("get")
    .description("Show one MCP tool's full description and input schema")
    .argument("<tool>", "Tool name as it appears in `nexus mcp tools list`")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools get agent_list
  $ nexus mcp tools get agent_create --json

Notes:
  THIS IS THE COMMAND TO RUN BEFORE "mcp call". The inputSchema it prints is the
  JSON Schema the server generated from the route's own contract, so the object
  you pass to --input is exactly the object described here — path parameters at
  the top level, plus "query" and "body" objects where the route has them.
  THE NAME MUST MATCH EXACTLY. It is the contract's authored tool name, not the
  CLI command and not the URL path, and an unknown name exits NON-ZERO rather
  than printing an empty record. See "nexus --help" for the exit-code table.
  A TOOL THIS KEY CANNOT SEE IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST,
  because the catalog is scope-filtered before it reaches this process. Check
  "nexus permissions access" before concluding the tool was removed.`
    )
    .action(async (name: string) => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const all = await listTools(transport);
        if (all === undefined) return;

        const tool = all.find((candidate) => candidate.name === name);
        if (!tool) {
          process.exitCode = reportFailure(
            "not-found",
            `No MCP tool named "${name}" is visible to this API key.`,
            `Run "nexus mcp tools list --filter ${name.split("_")[0]}" to see the names this key exposes.`
          );
          return;
        }

        if (isJsonMode()) {
          emitDocument(tool);
          return;
        }

        console.log(color.bold(tool.name));
        console.log(tool.description ?? "");
        console.log();
        console.log(
          color.dim(
            `read-only: ${tool.annotations?.readOnlyHint === true} · destructive: ${tool.annotations?.destructiveHint === true}`
          )
        );
        console.log();
        console.log(color.bold("Input schema"));
        // `?? {}` because `JSON.stringify(undefined)` returns the VALUE
        // undefined, and `console.log` then prints the word "undefined" as if it
        // were the schema. A tool with no declared input has an empty object.
        console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
