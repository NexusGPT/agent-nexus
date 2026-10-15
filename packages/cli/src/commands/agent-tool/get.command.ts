import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { TOOL_GET_CONTRACT } from "../agent-tool.contract.generated";

const GET_HELP = `
Examples:
  $ nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS IS THE VERIFICATION PATH for create and update, which print only the id.
  It returns the whole config, including the agentInputSchema that was actually
  stored — the field a caller most often gets wrong.
  A WORKFLOW config reads back as config.workflowId, mapped from the internally
  stored config.toolId, so it comes out under the name you wrote it with.`;

/** `nexus agent-tool get` */
export function registerAgentToolGetCommand(agentTool: Command, program: Command): void {
  const get = agentTool
    .command("get")
    .description("Get tool configuration details")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .addHelpText("after", GET_HELP)
    .action(async (agentId: string, toolId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tool = await client.agents.tools.get(agentId, toolId);
        printRecord(tool);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(get, TOOL_GET_CONTRACT);
}
