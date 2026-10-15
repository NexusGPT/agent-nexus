import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/**
 * `nexus access-card delete`
 *
 * 🚨 THE ONE DESTRUCTIVE VERB IN THIS WAVE THAT IS **NOT** `confirmable()`, AND
 * THAT IS THE SHIPPED BEHAVIOUR RATHER THAN AN OVERSIGHT IN THIS SPLIT. It
 * declares no `--yes`, asks nothing, and its own Notes say so outright. Compare
 * `user-group delete`, `custom-model delete` and `html-template delete`, all of
 * which refuse off a terminal. Adding a gate here would be a behaviour change,
 * which this split is not — the divergence is reported, not smoothed over.
 *
 * NOT bound to a contract either — see the note in `commands/access-card.ts`.
 */
export function registerAccessCardDeleteCommand(accessCard: Command, program: Command): void {
  accessCard
    .command("delete")
    .description("Delete an access card")
    .argument("<id>", "Access Card ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card delete 11111111-1111-4111-8111-111111111111

Notes:
  Master access cards cannot be deleted — that request is a 400.
  IT IS NOT IDEMPOTENT: DELETING AN ALREADY-DELETED CARD IS A "not found". So a
  retry after a timeout or a dropped connection reports a failure for a delete
  that in fact succeeded. Treat "not found" here as "already gone", not as an
  error to escalate.
  NO CONFIRMATION AND NO CHECK ON USE. A card an agent or workflow still names
  deletes without warning, and every call through it then fails 403
  ACCESS_CARD_NOT_FOUND at run time. Repoint the consumers first.
  "nexus credential delete" removes every card on the credential, master
  included, without going through this command.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.credentials.cards.delete(id);
        printSuccess("Access card deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
