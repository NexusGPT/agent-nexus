import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printTable } from "../../../output";

/** `nexus channel whatsapp-template list` */
export function registerChannelWhatsappTemplateListCommand(
  waTemplate: Command,
  program: Command
): void {
  waTemplate
    .command("list")
    .description("List WhatsApp message templates")
    .option("--connection-id <id>", "Filter by messaging connection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template list
  $ nexus channel whatsapp-template list --connection-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  SAYS NOTHING ABOUT META APPROVAL. Every template in the Twilio account is
  listed, approved or not, and a row here is not permission to send. Read
  "nexus channel whatsapp-template approvals" for the verdict.
  This is the Twilio-side inventory; "nexus deployment template list <depId>"
  is what a given deployment has attached. The two differ routinely.

  --json HERE IS A BARE ARRAY, not {data,meta} — same for "approvals". jq
  '.data[]' selects nothing and does not error, so the miss reads as an empty
  inventory. Use jq '.[]'.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listWhatsAppTemplates({
          connectionId: opts.connectionId
        });
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "friendly_name", label: "FRIENDLY NAME", width: 25 },
          { key: "language", label: "LANG", width: 8 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
