import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printTable } from "../../output";
import { TOOL_LIST_CONTRACT } from "../agent-tool.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus agent-tool list 11111111-1111-4111-8111-111111111111
  $ nexus agent-tool list 11111111-1111-4111-8111-111111111111 --json

Notes:
  Unpaginated — the payload is a bare array of every tool config on the agent,
  bounded by how the agent was built rather than by usage.
  ID is the CONFIG id: pass it to get / update / delete.
  ACTIVE is the config's isActive flag, which create sets to true.
  The table omits config and agentInputSchema — read either with
  "nexus agent-tool get" or --json.`;

/** `nexus agent-tool list` */
export function registerAgentToolListCommand(agentTool: Command, program: Command): void {
  const list = agentTool
    .command("list")
    .description("List tools attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText("after", LIST_HELP)
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tools = await client.agents.tools.list(agentId);

        printTable(tools, [
          { key: "id", label: "ID", width: 36 },
          { key: "label", label: "LABEL", width: 25 },
          { key: "type", label: "TYPE", width: 15 },
          { key: "isActive", label: "ACTIVE", width: 8, format: (v) => (v ? "yes" : "no") }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, TOOL_LIST_CONTRACT);
}
