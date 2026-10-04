import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord, printSuccess } from "../../../output";

/** `nexus channel whatsapp-sender create` */
export function registerChannelWhatsappSenderCreateCommand(
  waSender: Command,
  program: Command
): void {
  waSender
    .command("create")
    .description("Create a WhatsApp sender (registers phone with WhatsApp Business)")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--phone-number-id <id>", "Phone number ID")
    .requiredOption("--sender-name <name>", "Display name for the WhatsApp sender")
    .option("--waba-id <id>", "WhatsApp Business Account ID (reads from connection if omitted)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender create --connection-id 11111111-1111-4111-8111-111111111111 --phone-number-id 22222222-2222-4222-8222-222222222222 --sender-name "My Business"
  $ nexus channel whatsapp-sender create --connection-id 11111111-1111-4111-8111-111111111111 --phone-number-id 22222222-2222-4222-8222-222222222222 --sender-name "EU Support" --json

Notes:
  THE SENDER STARTS OFFLINE AND ONLY META CAN MAKE IT ONLINE. A 201 here means
  the registration was filed, not that the number can send. Poll
  "nexus channel whatsapp-sender list" until STATUS reads ONLINE; a refusal
  comes back as OFFLINE with offline_reasons rather than as an error.
  Registration takes minutes and can fail hours later.

  --phone-number-id is the Nexus phone number UUID from
  "nexus phone-number list", not the number itself. It must be ACTIVE and
  bought on this same connection.
  --sender-name is the display name Meta shows recipients and what Meta
  reviews — a name that misrepresents the business is a rejection reason.
  --waba-id is read off the connection when omitted; pass it only if you hold
  several WhatsApp Business Accounts.
  Then create the deployment with
  --body '{"whatsappSenderId":"<sender id>"}'.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createWhatsAppSender({
          connectionId: opts.connectionId,
          phoneNumberId: opts.phoneNumberId,
          senderName: opts.senderName,
          wabaId: opts.wabaId
        });
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "senderId", label: "Sender ID" },
          { key: "name", label: "Name" },
          { key: "wabaId", label: "WABA ID" },
          { key: "phoneNumberId", label: "Phone Number ID" }
        ]);
        printSuccess("WhatsApp sender created. Status may be OFFLINE while Meta approves.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
