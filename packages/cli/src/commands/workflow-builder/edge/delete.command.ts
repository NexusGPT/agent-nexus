import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus workflow edge delete` */
export function registerWorkflowEdgeDeleteCommand(edge: Command, program: Command): void {
  confirmable(edge.command("delete"))
    .description("Delete an edge from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<edge-id>", "Edge ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow edge delete 11111111-1111-4111-8111-111111111111 edge-789
  $ nexus workflow edge delete 11111111-1111-4111-8111-111111111111 edge-789 --yes

Notes:
  <edge-id> is NOT a UUID by rule — edges drawn on the canvas carry ids like
  "xy-edge__<source>-<target>". Read the exact id from "nexus workflow get".
  The API answers 204 with an empty body; this command prints its own
  {success, workflowId, edgeId} line, so --json is a CLI confirmation and never a
  server response. The nodes survive; only the connection goes, so the target may
  become a DISCONNECTED_NODE in validate.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (wfId: string, edgeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete edge ${edgeId} from workflow ${wfId}?`, opts)))
          return;

        await client.workflows.deleteEdge(wfId, edgeId);
        printSuccess("Edge deleted.", { workflowId: wfId, edgeId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
