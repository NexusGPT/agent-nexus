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
  PUBLISHING A PUBLISHED WORKFLOW REPUBLISHES IT IN PLACE — THAT IS THE REFRESH.
  After editing a node on a live workflow, run this again to move the change
  into the live snapshot, then check that publishedNodes matches nodes in
  "workflow get". The production triggers are UPDATED, not deleted: a webhook
  keeps its URL and its secret, and agents holding the workflow as a tool keep
  it throughout.
  DO NOT UNPUBLISH FIRST TO REFRESH. Unpublish deletes the triggers, so the
  publish after it creates new ones, and a new webhook trigger REQUIRES A NEW
  SECRET on every delivery: a sender still configured for the old one is
  answered 401 WEBHOOK_VERIFICATION_FAILED.
  It validates the graph and DEPLOYS THE TRIGGERS: a webhook starts accepting
  production calls and a schedule starts firing as soon as this returns.
  A WEBHOOK TRIGGER PUBLISHED FOR THE FIRST TIME REQUIRES ITS SECRET FROM THE
  FIRST DELIVERY: an unsigned POST to its production URL is 401
  WEBHOOK_VERIFICATION_FAILED. Read the secret with
  "workflow node webhook-secret" and configure the sender with it.
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
