import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus credential delete <id>` */
export function registerCredentialDeleteCommand(credential: Command, program: Command): void {
  confirmable(credential.command("delete"))
    .description("Delete a credential")
    .argument("<id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential delete 11111111-1111-4111-8111-111111111111
  $ nexus credential delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  BLAST RADIUS — THERE IS NO UNDO. Deleting a credential DELETES EVERY ACCESS
  CARD ON IT, including the master card that "access-card delete" refuses to
  remove, and every Vibe app grant those cards carry.
  Run "nexus access-card list --credential-id <id>" FIRST.

  THAT CHECK IS ONLY EVIDENCE IF IT ANSWERED. It REFUSES an id naming no
  credential rather than printing an empty list, so "no rows" is a fact about
  the credential and not about your paste. Read a refusal as "wrong id", never
  as "nothing to lose" — and never as "already deleted": the same 404 answers
  the TOOL-SCOPED id from "nexus tool credentials", which names a live account
  in the other id space, and says so when it can.

  NOTHING REPOINTS WHAT NAMES IT. Agent tool configs, workflow nodes and
  deployments store the credential id as plain data with no foreign key, so they
  keep the dead id and fail at call time. Nothing here reports them.

  A 2xx IS NOT ALWAYS A COMPLETE DELETE. The inventory row goes first; if the
  underlying OAuth or API-key connection is still referenced (e.g. by a
  Deployment) its cleanup is logged and skipped. The connection then serves
  those deployments while appearing in no "credential list".

  REFUSED WHILE A VIBE APP IS BOUND: 409 CREDENTIAL_STILL_BOUND, naming every
  app. Unbind each one, then retry — the refusal is the guard, not a glitch.

  A PIPEDREAM ACCOUNT IS REVOKED UPSTREAM BEFORE ANYTHING LOCAL HAPPENS. If
  Pipedream refuses you get 502 and NOTHING was deleted — the credential still
  works. Retry; the retry is idempotent.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (
          !(await confirmDestructive(
            `Delete credential ${id}? This also deletes its access cards.`,
            opts
          ))
        )
          return;

        await client.credentials.delete(id);
        printSuccess("Credential deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
