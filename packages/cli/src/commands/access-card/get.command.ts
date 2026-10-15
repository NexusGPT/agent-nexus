import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/**
 * `nexus access-card get`
 *
 * NOT bound to a contract — see the note beside the registration calls in
 * `commands/access-card.ts`.
 */
export function registerAccessCardGetCommand(accessCard: Command, program: Command): void {
  accessCard
    .command("get")
    .description("Get access card details")
    .argument("<id>", "Access Card ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card get 11111111-1111-4111-8111-111111111111
  $ nexus access-card get 11111111-1111-4111-8111-111111111111 --json

Notes:
  Policies is the WHOLE policy — an action absent from it is denied, so read
  the key set, not just the entries. Use --json; the table truncates.
  A card with Master true and policies {} allows everything. A card with Master
  FALSE and policies {} allows NOTHING. Read both fields together.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const card = await client.credentials.cards.get(id);
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "credentialId", label: "Credential ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "isMaster", label: "Master" },
          { key: "color", label: "Color" },
          { key: "policies", label: "Policies" },
          { key: "variables", label: "Variables" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
