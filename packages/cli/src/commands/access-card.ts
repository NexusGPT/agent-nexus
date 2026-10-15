import { Command } from "commander";

import { registerAccessCardAvailableActionsCommand } from "./access-card/available-actions.command";
import { registerAccessCardCreateCommand } from "./access-card/create.command";
import { registerAccessCardDeleteCommand } from "./access-card/delete.command";
import { registerAccessCardGetCommand } from "./access-card/get.command";
import { registerAccessCardListCommand } from "./access-card/list.command";
import { registerAccessCardUpdateCommand } from "./access-card/update.command";

export function registerAccessCardCommands(program: Command): void {
  const accessCard = program
    .command("access-card")
    .description("Manage access cards for credential-level action policies");

  accessCard.addHelpText(
    "after",
    `
WHAT AN ACCESS CARD IS FOR: handing the SAME connection to different agents
under different restrictions. A card names exactly which actions a credential
may run and which parameters those actions may set, so one Gmail connection can
be read-only for one agent and send-to-a-fixed-address for another — without a
second Gmail account and without giving either agent the raw credential.

The credential is the ACCESS; the card is the LIMIT on it. Every credential
already carries an unrestricted master card, so a card you create is always a
narrowing of something that already works.`
  );

  // REGISTRATION ORDER IS THE ORDER `--help` LISTS THEM, so it is part of the
  // published surface rather than a detail of this file.
  //
  // ONLY create AND update ARE CONTRACT-BOUND. The four reads and the delete
  // have no v1 contract descriptor, so those files call no `bindCommand` and
  // each says so in its own header — the claim lives here because it is a
  // statement about the SET, not about one verb.
  registerAccessCardListCommand(accessCard, program);
  registerAccessCardGetCommand(accessCard, program);
  registerAccessCardCreateCommand(accessCard, program);
  registerAccessCardUpdateCommand(accessCard, program);
  registerAccessCardDeleteCommand(accessCard, program);
  registerAccessCardAvailableActionsCommand(accessCard, program);
}
