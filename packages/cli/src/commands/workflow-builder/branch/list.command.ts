import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";

/** `nexus workflow branch list` */
export function registerWorkflowBranchListCommand(branch: Command, program: Command): void {
  branch
    .command("list")
    .description("List branches on a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch list 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow branch list 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  Branch operations only work on a "branching" node — anything else is 400
  BRANCH_NODE_NOT_BRANCHING.
  READ IDS FROM HERE, ALWAYS, AND RE-READ THEM AFTER EVERY DELETE. A branch id is
  assigned as br-001, br-002 … from the branch COUNT at creation time, so ids are
  reused: delete br-002 from three branches and the next create is handed br-003
  again, which the surviving br-003 already answers to. An id you held across a
  delete now addresses a different branch, and every command accepts it happily.
  Track branches by NAME through this command and look the id up each time you
  need one. An edge's --source-handle must equal an id this command reports.
  NEXT STEP is the branch's own pointer and is null until an edge leaves the branch.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { branches } = await client.workflows.listBranches(wfId, nodeId);
        printList(branches, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "nextStep", label: "NEXT STEP", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
