import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printTable } from "../../../output";

/** `nexus channel whatsapp-sender list` */
export function registerChannelWhatsappSenderListCommand(
  waSender: Command,
  program: Command
): void {
  waSender
    .command("list")
    .description("List WhatsApp senders — the live Meta registration state")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-sender list
  $ nexus channel whatsapp-sender list --json

Notes:
  THIS IS THE POLL. STATUS is fetched live from Twilio on every call, and a
  sender is unusable until it reads ONLINE. Registration takes minutes.
  OFFLINE MEANS BOTH "STILL WAITING" AND "REJECTED" — the display folds every
  non-ONLINE state into one word. Which one it is only appears in
  offline_reasons, which this table does not show: read it with --json. An
  empty offline_reasons on an OFFLINE sender means still in progress; entries
  there are Meta's refusal, and waiting longer will not fix it.
  A rejected sender is repaired by fixing the cause on Meta's side and
  recreating the sender, not by retrying this command.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listWhatsAppSenders();
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "phoneNumberId", label: "PHONE NUMBER ID", width: 38 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
