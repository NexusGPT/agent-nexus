import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus channel whatsapp-sender get` */
export function registerChannelWhatsappSenderGetCommand(waSender: Command, program: Command): void {
  waSender
    .command("get")
    .description("Get WhatsApp sender details")
    .argument("<id>", "Sender ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender get XEabc123
  $ nexus channel whatsapp-sender get XEabc123 --json

Notes:
  Same live Twilio read as "whatsapp-sender list", for one sender. STATUS is
  ONLINE or OFFLINE only — use --json for offline_reasons, which is the sole
  place a Meta rejection is stated.
  The <id> is the sender id from the list, not the phone number id.`
    )
    .action(async (id) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.getWhatsAppSender(id);
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "senderId", label: "Sender ID" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" },
          { key: "wabaId", label: "WABA ID" },
          { key: "phoneNumberId", label: "Phone Number ID" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
