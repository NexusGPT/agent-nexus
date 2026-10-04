import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus workflow node variables` */
export function registerWorkflowNodeVariablesCommand(node: Command, program: Command): void {
  node
    .command("variables")
    .description("List available upstream variables for a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node variables 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node variables 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  This is the list of {{…}} references this node may legally use: every node
  reachable backwards through the edges, with the fields each one exposes.
  A NODE WITH NO CHILDREN IN THIS LIST IS NOT A NODE WITH NO OUTPUT — it is one
  whose shape is unknown, because it has neither a declared outputFormat nor a
  stored test result. Test it first, then read this again.
  Inside a loop, the container exposes the PER-ITERATION item, and the reference
  path stays rooted at the loop node's id: the iterator name is a label only.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getAvailableVariables(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
