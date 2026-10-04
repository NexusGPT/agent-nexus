import type { BatchRequestBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode, printRecord, printSuccess } from "../../output";
import { asRequestBody, resolveBody } from "../../util/body";
import { WORKFLOW_BATCH_EXECUTE_CONTRACT } from "../workflow.contract.generated";
import { WORKFLOW_BATCH_HELP } from "./copy/batch-help";

/** `nexus workflow batch` — a pure `--body` command. */
export function registerWorkflowBatchCommand(workflow: Command, program: Command): void {
  const batch = workflow
    .command("batch")
    .description("Batch-create nodes, edges, and branches in a workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", WORKFLOW_BATCH_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveBody(opts.body);
        const result = await client.workflows.batch(
          id,
          asRequestBody<BatchRequestBody>(body ?? {})
        );
        if (isJsonMode()) {
          printRecord(result);
        } else {
          const { created } = result;
          printSuccess("Batch applied.", {
            nodes: Object.keys(created.nodes ?? {}).length,
            edges: (created.edges ?? []).length,
            branches: Object.keys(created.branches ?? {}).length
          });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  // A pure `--body` command: `--body` IS the whole request, so both enums are
  // genuinely reachable and neither has, or should have, a flag. The Notes above
  // already name the six trigger types nowhere — they point at "workflow
  // node-types" for node type names and say nothing about `triggerType` at all,
  // so the contract block is the first place an operator can read either list.
  bindCommand(batch, WORKFLOW_BATCH_EXECUTE_CONTRACT, {
    "Body.edges[].type": "--body only; one type per edge, inside the edges array",
    "Body.triggerType": "--body only; batch takes no flags but --body"
  });
}
