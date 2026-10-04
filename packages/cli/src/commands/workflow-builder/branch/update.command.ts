import type { UpdateBranchBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";

/** `nexus workflow branch update` */
export function registerWorkflowBranchUpdateCommand(branch: Command, program: Command): void {
  branch
    .command("update")
    .description("Update a branch")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .argument("<branch-id>", "Branch ID")
    // See `branch create`: conditions are not writable through this endpoint.
    .requiredOption("--body <json-or-file-or-->", "Updated branch JSON (name, description)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow branch update 11111111-1111-4111-8111-111111111111 node-456 br-001 --body '{"name":"Renamed"}'
  $ nexus workflow branch update 11111111-1111-4111-8111-111111111111 node-456 br-001 --body branch.json

Notes:
  RENAMES ONLY. name and description are the whole writable surface; a "conditions"
  array is silently dropped here exactly as on create. Conditions live in the
  node's data.logic — change them with "nexus workflow node update".
  <branch-id> is the br-NNN id from "nexus workflow branch list". An unknown one
  is 404 BRANCH_NOT_FOUND; a node that is not a branching node is a 400.`
    )
    .action(async (wfId: string, nodeId: string, branchId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.workflows.updateBranch(
          wfId,
          nodeId,
          branchId,
          asRequestBody<UpdateBranchBody>(body)
        );
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
