import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus workflow publish` — make the draft live. */
export function registerWorkflowPublishCommand(workflow: Command, program: Command): void {
  workflow
    .command("publish")
    .description("Publish a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow publish 11111111-1111-4111-8111-111111111111

Notes:
  Workflows must be PUBLISHED before they can be attached to agents as tools.
  Use "nexus workflow validate <id>" first to check for configuration errors.
  PUBLISHING TWICE IS A 409, NOT A REFRESH. An already-PUBLISHED workflow answers
  WORKFLOW_ALREADY_PUBLISHED, so after editing a node on a live workflow the only
  way to move the change into the live snapshot is unpublish, publish, then check
  that publishedNodes matches nodes in "workflow get".
  It validates the graph and DEPLOYS THE TRIGGERS: a webhook starts accepting
  production calls and a schedule starts firing as soon as this returns.
  VALIDATE PASSING DOES NOT GUARANTEE PUBLISH SUCCEEDS. Publish runs checks
  validate does not — an agentInput workflow's parameter names are validated
  here, and a bad one is a 400 naming the parameter and its schema errors.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.publish(id);
        printSuccess("Workflow published.", { ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
