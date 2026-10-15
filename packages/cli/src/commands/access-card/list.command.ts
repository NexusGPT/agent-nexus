import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/**
 * `nexus access-card list`
 *
 * NOT bound to a contract: no v1 contract descriptor is declared for this read,
 * so there is nothing for `bindCommand` to render. `create` and `update` are the
 * only two bound verbs in this namespace.
 */
export function registerAccessCardListCommand(accessCard: Command, program: Command): void {
  accessCard
    .command("list")
    .description("List access cards for a credential")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card list --credential-id 22222222-2222-4222-8222-222222222222
  $ nexus access-card list --credential-id 22222222-2222-4222-8222-222222222222 --json

Notes:
  --credential-id IS REQUIRED. Cards are scoped to one credential; there is no
  org-wide listing on this command.
  IT TAKES THE UNIFIED ID, FROM "nexus credential list". The ID column of
  "nexus tool credentials <tool-id>" is a DIFFERENT id space — tool-scoped, and
  only "tool delete-credential" accepts it. Both are UUIDs, so the wrong one is
  well-formed and reaches the server.
  AN ID THAT NAMES NO CREDENTIAL IS REFUSED, not answered with an empty list.
  That is what makes zero rows a fact about the credential rather than about
  your paste. If the id you passed is the tool-scoped one for a real account,
  the refusal names the unified id to use instead — so a refusal here is not
  evidence the credential is gone.
  THE MASTER CARD IS CREATED WITH THE CREDENTIAL, BY THE PLATFORM. You never
  make it and there is no command that would. So a brand-new credential already
  lists exactly one card — one row is the baseline here, not zero.
  THE MASTER ROW IS IN THIS LIST (MASTER true, policies {}). It is the
  credential's own all-access card, it cannot be deleted, and its policies
  cannot be edited — do not mistake it for a card you created.
  Run this BEFORE "credential delete": deleting the credential deletes every
  row printed here.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.cards.listByCredential(opts.credentialId);
        const cards = result.accessCards ?? result;

        printList(cards, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "isMaster", label: "MASTER", width: 8 },
          { key: "color", label: "COLOR", width: 10 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
