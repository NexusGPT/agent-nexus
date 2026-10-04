import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError, refuse } from "../../../errors";
import { isJsonMode, printRecord, printSuccess } from "../../../output";
import { awaitTestSendDelivery } from "../_shared/await-test-send-delivery";
import { TEMPLATE_TEST_SEND_NOTES } from "../copy/template-test-send-notes";
import { templateVariablesFromJson } from "../template.variables-from-json";
import type { DeliveryOutcome } from "../template-test-send.await-delivery";
import { testSendDocumentFields } from "../template-test-send.document";

/** `nexus channel whatsapp-template test-send` */
export function registerChannelWhatsappTemplateTestSendCommand(
  waTemplate: Command,
  program: Command
): void {
  waTemplate
    .command("test-send")
    .description("Send this template to a real phone for real money — there is no dry run")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--template-id <id>", "Template ID (Twilio content SID)")
    .requiredOption("--to <phone>", "Recipient phone number in E.164 format (e.g., +1234567890)")
    .option("--variables <json>", 'Template variables as JSON (e.g., \'{"1": "Hello"}\')')
    .option("--wait", "Poll delivery status until resolved (up to 2 minutes)")
    .addHelpText("after", TEMPLATE_TEST_SEND_NOTES)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const parsedVariables = templateVariablesFromJson(opts.variables);
        if (!parsedVariables.ok) {
          process.exitCode = refuse(
            "Invalid JSON for --variables.",
            'Example: --variables \'{"1": "Hello"}\''
          );
          return;
        }

        const result = await client.channels.testSendWhatsAppTemplate(opts.templateId, {
          connectionId: opts.connectionId,
          to: opts.to,
          variables: parsedVariables.variables
        });
        const data = result;

        // Same shape as `create --submit`: the send and the delivery verdict are
        // two terminal results, and --wait exists so a script can have the
        // second. Emitting the first document before the poll gave a script the
        // status the flag was meant to replace, with prose stuck to it.
        if (!isJsonMode()) {
          printRecord(data, [
            { key: "messageSid", label: "Message SID" },
            { key: "status", label: "Status" },
            { key: "to", label: "To" },
            { key: "from", label: "From" },
            { key: "sentAt", label: "Sent At" }
          ]);
          printSuccess("Template test-send initiated.");
        }

        let delivery: DeliveryOutcome | undefined;

        // Poll delivery status if --wait
        if (opts.wait) {
          delivery = await awaitTestSendDelivery(client, opts, data);
        }

        if (isJsonMode()) {
          printRecord({ ...data, ...testSendDocumentFields(delivery, opts.wait === true) });
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
