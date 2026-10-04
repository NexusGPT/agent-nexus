import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus workflow unpublish` — the first half of the only refresh path. */
export function registerWorkflowUnpublishCommand(workflow: Command, program: Command): void {
  workflow
    .command("unpublish")
    .description("Unpublish a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow unpublish 11111111-1111-4111-8111-111111111111

Notes:
  Back to DRAFT, and THE PRODUCTION TRIGGERS ARE DEACTIVATED — a live webhook or
  schedule stops firing, and agents holding this workflow as a tool stop being
  able to run it. It is a disabling, not a tidy-up.
  Unpublishing a workflow that is not published is a 409.
  This is the first half of the only refresh path: unpublish, then publish.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.unpublish(id);
        printSuccess("Workflow unpublished.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
