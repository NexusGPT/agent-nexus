import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/**
 * `nexus access-card delete`
 *
 * 🔴 THIS IS A BREAKING CHANGE TO A PUBLISHED CLI, AND IT IS THE DIRECTION
 * EVERY OTHER DESTRUCTIVE VERB ALREADY TOOK. Until now this verb was the one
 * entry in `UNCONFIRMED_DESTRUCTIVE` whose siblings — `user-group delete`,
 * `custom-model delete`, `html-template delete` — all refuse off a terminal.
 * It now declares `--yes` through {@link confirmable} and asks through
 * {@link confirmDestructive}, so a pipeline that omitted the flag REFUSES
 * instead of destroying. Refusing costs one retry; proceeding cost the card and
 * every agent call routed through it. `COMPATIBILITY.md` carries why clearing a
 * ledger line is a major-version act; no count is repeated here, because both
 * sets move whenever the next line is cleared.
 *
 * `confirmable()` wraps the command AT CREATION, which is the shape nearly every
 * sibling uses — `custom-model delete` is the one that calls it last, and its
 * own header says why that order is observable THERE. It is not observable here:
 * this verb binds no contract, so it has no `--print-contract` for `--yes` to
 * sit above, and `--yes` is its only option either way. The shape is matched
 * because a second spelling is what this change exists to remove, not because
 * the help text depends on it.
 *
 * There is no `--force`: in this CLI that flag means CASCADE (`external-tool
 * delete` also deletes the agent tool configs referencing the tool), and this
 * verb cascades nothing. `confirmDestructive` reads `opts.force` as consent, so
 * declaring one here would hand the widest-blast-radius spelling a way past the
 * question.
 *
 * NOT bound to a contract either — see the note in `commands/access-card.ts`.
 */
export function registerAccessCardDeleteCommand(accessCard: Command, program: Command): void {
  confirmable(accessCard.command("delete"))
    .description("Delete an access card")
    .argument("<id>", "Access Card ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card delete 11111111-1111-4111-8111-111111111111
  $ nexus access-card delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  IT PROMPTS, AND OFF A TERMINAL THAT PROMPT IS A REFUSAL. --yes is required in
  CI or in a pipe; without it and without a TTY the command declines rather than
  proceeding on a default.
  Master access cards cannot be deleted — that request is a 400.
  IT IS NOT IDEMPOTENT: DELETING AN ALREADY-DELETED CARD IS A "not found". So a
  retry after a timeout or a dropped connection reports a failure for a delete
  that in fact succeeded. Treat "not found" here as "already gone", not as an
  error to escalate.
  NO CHECK ON USE. The prompt asks you; it does not look. A card an agent or
  workflow still names deletes on a "y", and every call through it then fails
  403 ACCESS_CARD_NOT_FOUND at run time. Repoint the consumers first.
  "nexus credential delete" removes every card on the credential, master
  included, without going through this command.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete access card ${id}? This cannot be undone.`, opts)))
          return;

        const client = createClient(program.optsWithGlobals());
        await client.credentials.cards.delete(id);
        printSuccess("Access card deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
