import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus workflow unpublish` — take a live workflow offline. Not a refresh. */
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
  Back to DRAFT, and THE PRODUCTION TRIGGERS ARE DELETED — a live webhook or
  schedule stops firing, and agents holding this workflow as a tool stop being
  able to run it. It is a disabling, not a tidy-up.
  Unpublishing a workflow that is not published is a 409.
  IT IS NOT HOW YOU REFRESH A LIVE WORKFLOW. To move an edit into the live
  snapshot, run "workflow publish" on the published workflow: that republishes
  in place and keeps the triggers.
  A WEBHOOK TRIGGER DOES NOT SURVIVE THIS. The next publish creates a new
  trigger with a NEW SECRET that every delivery must present, so a sender
  configured before the unpublish is answered 401 WEBHOOK_VERIFICATION_FAILED
  until it is given the new one. Read it with "workflow node webhook-secret"
  after publishing.`
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
