import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { WORKFLOW_EXECUTION_GET_NODE_RESULT_CONTRACT } from "../execution.contract.generated";
import { EXECUTION_NODE_RESULT_HELP } from "./copy/node-result-help";

/** `nexus execution node-result` — one node's stored result. */
export function registerExecutionNodeResultCommand(execution: Command, program: Command): void {
  const nodeResult = execution
    .command("node-result")
    .description("Get result of a specific node in an execution")
    .argument("<id>", "Execution ID")
    .argument("<node-id>", "Node ID")
    .addHelpText("after", EXECUTION_NODE_RESULT_HELP)
    .action(async (id: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.getNodeResult(id, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(nodeResult, WORKFLOW_EXECUTION_GET_NODE_RESULT_CONTRACT);
}
