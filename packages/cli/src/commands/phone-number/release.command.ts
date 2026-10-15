import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/**
 * `nexus phone-number release` — PERMANENT. Why it is gated, and why the gate is
 * not written here, is in the header of `commands/phone-number.ts`.
 *
 * NOT bound to a contract: no v1 contract descriptor is declared for the release
 * route.
 */
export function registerPhoneNumberReleaseCommand(phoneNumber: Command, program: Command): void {
  confirmable(phoneNumber.command("release"))
    .description("Give a number back to the carrier — PERMANENT, and it silences its channels")
    .argument("<id>", "Phone number ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number release 11111111-1111-4111-8111-111111111111
  $ nexus phone-number release 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THE NUMBER GOES BACK TO THE CARRIER POOL AND CANNOT BE RECLAIMED. Somebody
  else can buy it minutes later. Anyone who has it saved, or a customer
  mid-conversation, reaches a stranger or nothing at all.

  EVERY DEPLOYMENT ON THIS NUMBER IS DETACHED AND STOPS RECEIVING, AND NOTHING
  ERRORS. Their phoneNumberId is nulled, every WhatsApp sender registered on
  the number is deregistered and deleted, and the deployments stay listed and
  look healthy while receiving nothing. List them first:
  "nexus deployment list --type WHATSAPP --json" and check phoneNumberId.

  Billing stops when the release reaches the carrier. If that call fails the
  number is still released in Nexus and an operator issue is filed — the
  response's twilioReleased: false is the only sign, and until an operator
  clears it the carrier may keep charging.
  The response counts what it took with it: detachedDeployments and
  removedWhatsappSenders.
  Releasing an already-released number is a 409, not a silent success. A key
  that identifies no user is a 401 — the release is recorded against a person.
  Needs phone_numbers:delete, which phone_numbers:write does not imply.

  IN A SCRIPT, WITHOUT --yes, IT RELEASES NOTHING AND EXITS NON-ZERO.
  Non-interactive stdin gets a refusal document instead of a prompt, so a cleanup
  job that never checks the exit code leaves every number in place and still
  bills. The gate reads STDIN — redirecting output alone still prompts.`
    )
    .action(async (id: string, opts) => {
      try {
        if (
          !(await confirmDestructive(
            `Release phone number ${id}? It cannot be reclaimed and its deployments stop receiving.`,
            opts
          ))
        ) {
          return;
        }

        const client = createClient(program.optsWithGlobals());
        await client.phoneNumbers.release(id);
        printSuccess(`Phone number ${id} released successfully`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
