import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { WORKFLOW_EXECUTION_RETRY_NODE_CONTRACT } from "../execution.contract.generated";

/** `nexus execution retry` — re-run one node of a finished execution. */
export function registerExecutionRetryCommand(execution: Command, program: Command): void {
  const retry = execution
    .command("retry")
    .description("Retry a failed node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID to retry")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution retry 11111111-1111-4111-8111-111111111111 node-456

Notes:
  IT NEEDS THE RUN TO STILL BE RUNNING, AND THAT IS THE USUAL REFUSAL. The retry
  re-queues the node on the live in-memory executor, so a run that already
  reached FAILED, COMPLETED or CANCELLED has no executor left and answers 400
  "Workflow execution is not running". Retry is for a node that errored inside a
  run that is still going, not for resurrecting a finished one.
  IT ONLY RETRIES A NODE IN ERROR, AND ONLY A RETRYABLE TYPE. A node in any other
  state is a 400, and so is a node whose type is not on the retryable list — the
  list is re-read at retry time, so a type that has since been removed from it
  refuses even on a row recorded as retryable.
  <node-id> TAKES EITHER SPELLING: the graph node id from
  "execution diagnose", or the execution-node row id from
  "execution node-result". The graph id is tried first.
  A 404 means the execution is not yours or does not exist, or the node names
  nothing inside it. A 400 means it was found and refused, and the message says
  which of the reasons above applied.
  "RETRYING" IS ACCEPTANCE, NOT COMPLETION. The node is queued and runs
  asynchronously; watch it with "execution follow <id>".
  To re-run a node OUTSIDE its original execution, use
  "nexus workflow node test <wf-id> <node-id>", or the whole chain with
  "nexus workflow test <wf-id>". Neither reuses the failed execution.`
    )
    .action(async (id: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.retryNode(id, nodeId);
        // `result` carries `executionId` and `nodeId` as required fields and is
        // spread last, so it always won — naming them again ahead of it was
        // dead. Dropping them is byte-identical at runtime; the `as any` is
        // what stopped the compiler saying so.
        printSuccess("Node retry initiated.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(retry, WORKFLOW_EXECUTION_RETRY_NODE_CONTRACT);
}
