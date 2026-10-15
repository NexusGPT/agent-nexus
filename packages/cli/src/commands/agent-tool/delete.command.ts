import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { TOOL_DELETE_CONTRACT } from "../agent-tool.contract.generated";

const DELETE_HELP = `
Examples:
  $ nexus agent-tool delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-tool delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Answers 200 with {id, deleted: true}, not 204.
  IT REMOVES THE CONFIG, NOT THE TARGET. The workflow, task, collection or
  credential the config pointed at survives untouched and stays attached to
  whatever else uses it — so this is how you take a capability away from ONE
  agent without affecting any other.`;

/** `nexus agent-tool delete` */
export function registerAgentToolDeleteCommand(agentTool: Command, program: Command): void {
  const remove = confirmable(agentTool.command("delete"))
    .description("Remove a tool from an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .addHelpText("after", DELETE_HELP)
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        // Name BOTH ids. The route is `agents/<agentId>/tools/<toolId>` and
        // the agent is what decides which tool the server may touch, so a
        // prompt that echoes only the tool cannot show a mismatch back to the
        // operator — the one place a wrong pairing is still catchable by a
        // human before the write happens.
        if (!(await confirmDestructive(`Remove tool ${toolId} from agent ${agentId}?`, opts)))
          return;

        await client.agents.tools.delete(agentId, toolId);
        printSuccess("Tool removed from agent.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(remove, TOOL_DELETE_CONTRACT);
}
