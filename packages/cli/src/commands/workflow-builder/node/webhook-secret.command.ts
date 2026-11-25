import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { WORKFLOW_GET_WEBHOOK_SECRET_CONTRACT } from "../../workflow.contract.generated";

/** `nexus workflow node webhook-secret` */
export function registerWorkflowNodeWebhookSecretCommand(node: Command, program: Command): void {
  const webhookSecret = node
    .command("webhook-secret")
    .description("Get the secret a published webhook trigger's sender must present")
    .argument("<workflow-id>", "Workflow ID")
    .argument("<node-id>", "Webhook trigger node ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node webhook-secret 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node webhook-secret 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  A WEBHOOK TRIGGER CREATED SINCE 2026-10-31 REFUSES A DELIVERY WITHOUT THIS
  SECRET: its production URL answers 401 WEBHOOK_VERIFICATION_FAILED. Send the
  secret verbatim in the header headerName names (x-nexus-webhook-secret):

    $ curl -X POST "$WEBHOOK_URL" -H "x-nexus-webhook-secret: $SECRET" \\
        -H "Content-Type: application/json" -d '{"hello":"world"}'

  Or sign the body instead, and send signatureHeaderName (x-nexus-signature) as
  t=<unix seconds>,v1=<hex>, where <hex> is the HMAC-SHA256 of
  "<t>.<raw request body>" keyed with the secret. A signature older than
  signatureToleranceSeconds is refused.
  THE TRIGGER EXISTS ONLY WHILE THE WORKFLOW IS PUBLISHED. On a draft, and on a
  node that is not a webhookTrigger, this is 404 TRIGGER_WEBHOOK_NOT_FOUND.
  Publish first, then read the secret.
  THE SECRET SURVIVES "workflow publish" AND IS REPLACED BY AN UNPUBLISH. Run
  "workflow publish" again after an edit and the sender keeps working. Run
  "workflow unpublish" and then publish, and the trigger comes back with a NEW
  secret: read it again and reconfigure the sender.
  secret IS null AND enforced IS false on a trigger first published before
  2026-10-31. It still accepts a delivery with no secret. Publishing the
  workflow again issues one without enforcing it; enforcing and rotating are
  done in the dashboard's trigger panel.
  THE OUTPUT IS A CREDENTIAL. Whoever holds it can start runs of this workflow,
  so keep it out of tickets, commits and logs. Needs the workflows:write scope.`
    )
    .action(async (wfId: string, nodeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getWebhookSecret(wfId, nodeId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after the hand-written prose. Binding is what lets the id-thread
  // sweep prove this leaf's route instead of ledgering it as unprovable.
  bindCommand(webhookSecret, WORKFLOW_GET_WEBHOOK_SECRET_CONTRACT);
}
