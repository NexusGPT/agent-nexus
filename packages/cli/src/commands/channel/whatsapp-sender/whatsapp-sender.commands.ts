import type { Command } from "commander";

import { registerChannelWhatsappSenderCreateCommand } from "./create.command";
import { registerChannelWhatsappSenderGetCommand } from "./get.command";
import { registerChannelWhatsappSenderListCommand } from "./list.command";

/** `nexus channel whatsapp-sender …` — the WhatsApp sender sub-group. */
export function registerChannelWhatsappSenderCommands(channel: Command, program: Command): void {
  const waSender = channel.command("whatsapp-sender").description("Manage WhatsApp senders");

  waSender.addHelpText(
    "after",
    `
A sender is a phone number registered with WhatsApp Business through Meta. It
needs a messaging connection with a linked WABA and an ACTIVE phone number
bought on that connection, in that order.

CREATING ONE DOES NOT MAKE IT USABLE. It starts OFFLINE and only Meta can make
it ONLINE, which takes minutes and can be refused. "whatsapp-sender list" is
the poll, and its offline_reasons — visible only with --json — is the one
place a refusal is stated.

There is no delete here: a sender is removed by releasing its phone number,
which deregisters and deletes it.`
  );

  registerChannelWhatsappSenderListCommand(waSender, program);
  registerChannelWhatsappSenderCreateCommand(waSender, program);
  registerChannelWhatsappSenderGetCommand(waSender, program);
}
