import type { Command } from "commander";

import { registerChannelConnectionCreateCommand } from "./create.command";
import { registerChannelConnectionListCommand } from "./list.command";

/** `nexus channel connection …` — the messaging-connection sub-group. */
export function registerChannelConnectionCommands(channel: Command, program: Command): void {
  const connection = channel.command("connection").description("Manage messaging connections");

  connection.addHelpText(
    "after",
    `
The messaging connection is the account WhatsApp, SMS and Voice all hang off,
and an organization gets exactly ONE. Its region is fixed when it is created
and every number bought afterwards lives there, so create it deliberately.

AN EMPTY LIST IS THE SAME OUTPUT AS "YOU HAVE NOT SET THIS UP YET". With no
connection, this list, "whatsapp-sender list", "whatsapp-template list" and
"whatsapp-template approvals" all answer an empty array and exit 0 — no error,
no hint that the prerequisite is what is missing rather than the inventory being
empty. Run "nexus channel setup --type WHATSAPP" to tell the two apart; it is
the one command that reports a missing prerequisite as a prerequisite.

There is no delete and no update here — a second create is a 409.`
  );

  registerChannelConnectionListCommand(connection, program);
  registerChannelConnectionCreateCommand(connection, program);
}
