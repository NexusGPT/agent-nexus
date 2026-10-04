import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus workflow node test-payload` */
export function registerWorkflowNodeTestPayloadCommand(node: Command, program: Command): void {
  node
    .command("test-payload")
    .description("Get a webhook trigger's URLs and the last received test payload")
    .argument("<wf-id>", "Workflow ID")
    .argument("<node-id>", "Webhook trigger node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node test-payload 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node test-payload 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  Returns the test + production webhook URLs (available pre-publish) and the last
  payload a test event delivered. Fire a test event at the testWebhookUrl, then
  run this again to read it back.
  The node id must be a webhookTrigger. Read it from "nexus workflow overview" or
  "nexus workflow get" — the same two URLs also appear under "node get".`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getWebhookTestPayload(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
