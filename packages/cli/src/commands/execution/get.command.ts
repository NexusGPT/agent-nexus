import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { WORKFLOW_EXECUTION_GET_CONTRACT } from "../execution.contract.generated";

/** `nexus execution get` — one run's record. */
export function registerExecutionGetCommand(execution: Command, program: Command): void {
  const get = execution
    .command("get")
    .description("Get execution details")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution get 11111111-1111-4111-8111-111111111111
  $ nexus execution get 11111111-1111-4111-8111-111111111111 --json

Notes:
  A per-node test id is accepted here and resolves to its parent execution, so a
  404 means the id names nothing this organization can reach — a wrong id, or one
  belonging to somebody else. The two are deliberately indistinguishable.
  Type names what the row is: run, loop_iteration or node_test. On a
  loop_iteration, "Loop node" is the graph node whose body this pass ran, so a
  handful of nodes and no trigger is the expected shape rather than a truncated run.
  --json adds triggerType, triggerData, error, outputData, pollingToken and
  nodeStatusCounts.
  pollingToken IS MINTED ONLY FOR A PRODUCTION WEBHOOK RUN. A run started by
  "workflow test", by a schedule, by an agent or from this API carries null, and
  that is the normal state, not a missing value — "execution poll --token" is
  reachable only for webhook-triggered runs. Poll those other runs by id.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const exec = await client.workflowExecutions.get(id);
        printRecord(exec, [
          { key: "id", label: "ID" },
          { key: "workflowId", label: "Workflow" },
          { key: "executionType", label: "Type" },
          { key: "parentNodeId", label: "Loop node" },
          { key: "status", label: "Status" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" },
          { key: "duration", label: "Duration" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(get, WORKFLOW_EXECUTION_GET_CONTRACT);
}
