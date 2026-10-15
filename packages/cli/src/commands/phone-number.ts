import { Command } from "commander";

import { registerPhoneNumberBuyCommand } from "./phone-number/buy.command";
import { registerPhoneNumberGetCommand } from "./phone-number/get.command";
import { registerPhoneNumberListCommand } from "./phone-number/list.command";
import { registerPhoneNumberReleaseCommand } from "./phone-number/release.command";
import { registerPhoneNumberSearchCommand } from "./phone-number/search.command";

/**
 * `buy` and `release` SPEND MONEY, and both go through the shared confirmation.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE TWO ARE GATED, AND WHY THE GATE IS NOT WRITTEN HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `buy` and `release` were the only mutating commands in this namespace with
 * neither a confirmation flag nor a warning, while `workspace delete`,
 * `deployment delete` and `whatsapp-template delete` — none of which move money
 * — all gate on `--yes`. They are also the only two here that cannot be undone:
 * a purchase bills monthly from the moment it returns, and a release hands the
 * number back to the carrier pool where it cannot be reclaimed.
 *
 * This file used to carry its OWN copy of the rule, and the copy was correct —
 * which is precisely why it survived so long. A correct copy is still a second
 * place the rule can change, and the gate over the tree could only ever prove
 * that a `--yes` was DECLARED, never that the branch behind it was the shared
 * one. `confirmable()` + `confirmDestructive()` make the gate structural: the
 * declaration is a fact on the `Command` and the ask is a call into one module,
 * so `destructive-confirmation.driven.test.ts` can drive this command with no
 * terminal and OBSERVE the refusal rather than infer it from a flag.
 *
 * The behaviour a caller sees is unchanged: without a terminal and without
 * `--yes`, both verbs refuse and buy or release nothing.
 *
 * It stays whole and stays here, in the namespace's front door, because it is
 * one argument about TWO verbs — split across `buy.command.ts` and
 * `release.command.ts` it would become two half-arguments that can drift apart.
 */

export function registerPhoneNumberCommands(program: Command): void {
  const phoneNumber = program
    .command("phone-number")
    .description("Search, buy, and manage phone numbers for SMS/Voice deployments");

  phoneNumber.addHelpText(
    "after",
    `
TWO OF THESE COMMANDS MOVE MONEY AND NEITHER CAN BE UNDONE. "buy" starts a
monthly charge that runs until you release the number; "release" hands it back
to the carrier pool, where it cannot be reclaimed. Both refuse to run
non-interactively without --yes.

The usual order:
  1. nexus channel connection create   numbers are bought on a connection
  2. nexus phone-number search         look, costs nothing, reserves nothing
  3. nexus phone-number buy            THE PURCHASE
  4. nexus channel whatsapp-sender create   (WhatsApp only)
  5. nexus deployment create --type WHATSAPP | TWILIO_SMS | TWILIO_VOICE

A number must be ACTIVE to be bound to a deployment. Reads need
phone_numbers:read, buy needs phone_numbers:write, release needs
phone_numbers:delete — and release additionally needs a key that identifies a
user, or it is a 401.`
  );

  // REGISTRATION ORDER IS THE ORDER `--help` LISTS THEM, so it is part of the
  // published surface rather than a detail of this file.
  //
  // ONLY search IS CONTRACT-BOUND. buy, list, get and release have no v1
  // contract descriptor, so those files call no `bindCommand` and each says so
  // in its own header — the claim lives here because it is a statement about
  // the SET, not about one verb.
  registerPhoneNumberSearchCommand(phoneNumber, program);
  registerPhoneNumberBuyCommand(phoneNumber, program);
  registerPhoneNumberListCommand(phoneNumber, program);
  registerPhoneNumberGetCommand(phoneNumber, program);
  registerPhoneNumberReleaseCommand(phoneNumber, program);
}
