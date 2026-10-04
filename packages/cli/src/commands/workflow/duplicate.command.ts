import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus workflow duplicate` — copy a workflow. */
export function registerWorkflowDuplicateCommand(workflow: Command, program: Command): void {
  workflow
    .command("duplicate")
    .description("Duplicate a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow duplicate 11111111-1111-4111-8111-111111111111

Notes:
  EVERY NODE AND EDGE ID IS REGENERATED. The copy is a different graph with the
  same shape, so any id you held from the original addresses nothing in it — read
  the new ids from the response or "workflow get".
  The copy starts in DRAFT with no deployed triggers, so nothing fires until you
  publish it, and its transient test state (runOutput, loop test data) is stripped.
  It is named "<name> (copy)", numbered upward, so the uniqueness rule that
  create enforces never blocks a duplicate. Answers 201.
  dashboardUrl in the payload is THE COPY'S canvas, added by this CLI rather
  than returned by the API.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const wf = await client.workflows.duplicate(id);
        printSuccess("Workflow duplicated.", {
          id: wf.id,
          name: wf.name,
          dashboardUrl: dashboardUrlFor("workflow", wf.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
