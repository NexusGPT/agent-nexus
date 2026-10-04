import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus channel whatsapp-template get` */
export function registerChannelWhatsappTemplateGetCommand(
  waTemplate: Command,
  program: Command
): void {
  waTemplate
    .command("get")
    .description("Get WhatsApp template details")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template get HX123
  $ nexus channel whatsapp-template get HX123 --json

Notes:
  <templateId> is the Twilio content SID (HX...), not the friendly name.
  Returns the content only — approval status is not part of it. Read
  "nexus channel whatsapp-template approvals" for that.
  "types" is the Twilio Types object as stored; use it as the starting point
  for a --body-file when creating a variant.`
    )
    .action(async (templateId) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.getWhatsAppTemplate(templateId);
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "friendly_name", label: "Friendly Name" },
          { key: "language", label: "Language" },
          { key: "types", label: "Types" },
          { key: "variables", label: "Variables" },
          { key: "created_at", label: "Created At" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
