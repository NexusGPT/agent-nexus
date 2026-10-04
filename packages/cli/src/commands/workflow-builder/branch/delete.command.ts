import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus workflow branch delete` */
export function registerWorkflowBranchDeleteCommand(branch: Command, program: Command): void {
  confirmable(branch.command("delete"))
    .description("Delete a branch from a node")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .argument("<branch-id>", "Branch ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch delete 11111111-1111-4111-8111-111111111111 node-456 br-001
  $ nexus workflow branch delete 11111111-1111-4111-8111-111111111111 node-456 br-001 --yes

Notes:
  IT TAKES THREE THINGS, NOT ONE: the branch, its logic entry (the conditions), and
  EVERY EDGE that used this branch as its sourceHandle. Whatever those edges led to
  is now unreachable from this node and validate will report it as a
  DISCONNECTED_NODE.
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, nodeId, branchId} line, so --json is a CLI confirmation
  and never a server response.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete branch ${branchId} from node ${nodeId}?`, opts)))
          return;

        await client.workflows.deleteBranch(wfId, nodeId, branchId);
        printSuccess("Branch deleted.", { workflowId: wfId, nodeId, branchId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
