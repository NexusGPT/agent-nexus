import { Command } from "commander";

import { registerChannelConnectWabaCommand } from "./channel/connect-waba.command";
import { registerChannelConnectionCommands } from "./channel/connection/connection.commands";
import { registerChannelSetupCommand } from "./channel/setup.command";
import { registerChannelWhatsappSenderCommands } from "./channel/whatsapp-sender/whatsapp-sender.commands";
import { registerChannelWhatsappTemplateCommands } from "./channel/whatsapp-template/whatsapp-template.commands";

export function registerChannelCommands(program: Command): void {
  const channel = program
    .command("channel")
    .description("Set up deployment channels: connections, phone numbers, WhatsApp senders");

  channel.addHelpText(
    "after",
    `
Everything here is what must exist BEFORE "nexus deployment create" can work.
Run "nexus channel setup --type <TYPE>" first — it names the next missing
piece and stops there.

WhatsApp, in the order the pieces have to arrive:
  1. channel connection create        one messaging connection per org
  2. channel connect-waba             browser only, links your Meta account
  3. nexus phone-number buy           A PURCHASE — it bills, see its help
  4. channel whatsapp-sender create   registers the number, Meta must approve
  5. nexus deployment create --type WHATSAPP

Two things here reach the outside world and cannot be undone from the CLI:
"whatsapp-template test-send" sends a real billed message to a real phone, and
"whatsapp-template create --submit" files the template with Meta.

🚨 AN EMPTY LIST HERE USUALLY MEANS STEP 1 NEVER HAPPENED, NOT AN EMPTY
INVENTORY. With no messaging connection, "channel connection list",
"channel whatsapp-sender list", "channel whatsapp-template list" and
"channel whatsapp-template approvals" ALL answer an empty array and exit 0.
Nothing in any of those four says a prerequisite is missing, so "no templates"
and "no account" are the same output. Settle it before reading any of them as
inventory:

  $ nexus channel setup --type WHATSAPP    # names the next missing piece

An empty "connection list" is the root cause of the other three; there is no
error to find further down the chain.

Needs channels:read / channels:write; the phone-number steps run on
phone_numbers:read / :write / :delete instead.`
  );

  registerChannelSetupCommand(channel, program);
  registerChannelConnectWabaCommand(channel, program);
  registerChannelConnectionCommands(channel, program);
  registerChannelWhatsappSenderCommands(channel, program);
  registerChannelWhatsappTemplateCommands(channel, program);
}
