import type { Command } from "commander";

import { registerMcpToolsGetCommand } from "./get.command";
import { registerMcpToolsListCommand } from "./list.command";

/** `nexus mcp tools …` */
export function registerMcpToolsCommands(mcp: Command, program: Command): void {
  const tools = mcp
    .command("tools")
    .description("Read the MCP tool catalog your API key can see")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools get agent_list

Notes:
  BOTH VERBS SEND THE SAME tools/list REQUEST. "get" filters the catalog in this
  process, so it costs one round trip and can never disagree with "list".`
    );

  registerMcpToolsListCommand(tools, program);
  registerMcpToolsGetCommand(tools, program);
}
