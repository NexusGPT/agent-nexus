import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess, printWarning } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { NODE_DELETE_NOTES } from "../copy/node-delete-notes";

/** `nexus workflow node delete` */
export function registerWorkflowNodeDeleteCommand(node: Command, program: Command): void {
  confirmable(node.command("delete"))
    .description("Delete a node from a workflow")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Node ID")
    .addHelpText("after", NODE_DELETE_NOTES)
    .action(async (wfId: string, nodeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete node ${nodeId} from workflow ${wfId}?`, opts)))
          return;

        const result = await client.workflows.deleteNode(wfId, nodeId);

        // A server that has not shipped the enumeration yet answers 204, and the
        // transport synthesizes `{}` for an empty body — so these three arrays
        // are typed present and CAN be absent across a version skew, which is
        // the one direction a published CLI cannot control. Reading `.length`
        // off `undefined` would throw AFTER the delete already happened, which
        // reads as a failed command and invites a retry of a destructive call.
        // Printing zeroes instead would be the exact lie this command was fixed
        // for, so the fallback says the server did not report rather than
        // reporting nothing removed.
        if (!Array.isArray(result.deletedNodeIds)) {
          printSuccess("Node deleted.", { workflowId: wfId, nodeId });
          printWarning(
            "This server did not report what the deletion removed.",
            "Deleting a loop or doWhile takes its whole body and the edges either side of it.",
            `Check with "nexus workflow get ${wfId}".`
          );
          return;
        }

        // The enumeration is carried out rather than dropped: one call on a loop
        // removes its whole body and the edges either side of it, and this used
        // to print a fixed "Node deleted." over a 204 with nothing in it
        // (NEX-4047) — the same defect `asset delete` had with objectRemoved.
        //
        // The counts live in the MESSAGE, which `printSuccess` carries into the
        // JSON document too, so no `deletedNodes` key restates what
        // `deletedNodeIds.length` already answers. The ids themselves are printed
        // on both channels rather than only under --json: this is a one-shot
        // destructive command, the nodes are gone by the time it prints, and a
        // human asking "what did I just lose?" has no second place to look.
        printSuccess(
          `Deleted ${result.deletedNodeIds.length} node(s) and ${result.deletedEdgeIds.length} edge(s).`,
          {
            workflowId: wfId,
            nodeId,
            deletedNodeIds: result.deletedNodeIds,
            deletedEdgeIds: result.deletedEdgeIds,
            severedNodeIds: result.severedNodeIds
          }
        );

        if (result.severedNodeIds.length > 0) {
          // STDERR, exit code stays 0 — the deletion succeeded. This is the half
          // of the damage that is NOT in the deleted lists: nodes that are still
          // there and just lost a connection, which is what leaves the graph
          // severed rather than merely shortened.
          printWarning(
            `${result.severedNodeIds.length} surviving node(s) lost an edge to this deletion and are now unconnected on that side.`,
            `Severed: ${result.severedNodeIds.join(", ")}`,
            'Re-wire them with "nexus workflow edge create", or check the damage with "nexus workflow validate".'
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
