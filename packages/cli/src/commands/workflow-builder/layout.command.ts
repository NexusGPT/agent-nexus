import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus workflow layout` */
export function registerWorkflowLayoutCommand(workflow: Command, program: Command): void {
  workflow
    .command("layout")
    .description("Auto-position nodes in a workflow")
    .argument("<wf-id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow layout 11111111-1111-4111-8111-111111111111

Notes:
  Cosmetic only — it rewrites node positions and touches nothing else.
  You rarely need it: every node, edge, branch and batch write re-lays-out the
  graph already, which is also why hand-set positions do not persist as given.`
    )
    .action(async (wfId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.workflows.layout(wfId);
        printSuccess("Workflow layout applied.", { workflowId: wfId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
