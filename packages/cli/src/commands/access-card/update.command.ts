import type { UpdateAccessCardBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { ACCESS_CARD_UPDATE_CONTRACT } from "../access-card.contract.generated";
import { VARIABLES_ARE_JSON_ONLY } from "./_shared/variables-are-json-only";

/** `nexus access-card update` */
export function registerAccessCardUpdateCommand(accessCard: Command, program: Command): void {
  const update = accessCard
    .command("update")
    .description("Update an access card")
    .argument("<id>", "Access Card ID")
    .option("--name <name>", "Updated name")
    .option("--description <text>", "Updated description")
    .option("--color <color>", "Updated color")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus access-card update 11111111-1111-4111-8111-111111111111 --name "Restricted Send"
  $ nexus access-card update 11111111-1111-4111-8111-111111111111 --data '{"policies":{"gmail:send_email":{"parameters":{"to":{"enabled":false,"value":"support@company.com"}}}}}'

Notes:
  policies IS REPLACED WHOLESALE, NEVER MERGED. Send the complete map every
  time — sending one action drops every other action the card allowed, and the
  response looks like a successful update.
  Read the current map with "access-card get <id> --json" and edit that.
  THE REPLACEMENT ONLY FIRES WHEN YOU ACTUALLY SEND policies. A metadata-only
  edit — --name, --description or --color with no --data — leaves the existing
  policies untouched. So renaming a card is safe; it is only a --data carrying
  a partial policies map that silently narrows the card.

  THE MASTER CARD REFUSES policies AND variables: 400. Rename or recolour it
  freely; to restrict anything, create a derived card instead.

  Same semantics as create — unlisted action denied, unlisted parameter
  stripped, "enabled": false + "value" pins a value the caller cannot override.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.color !== undefined && { color: opts.color })
        });

        const card = await client.credentials.cards.update(
          id,
          asRequestBody<UpdateAccessCardBody>(body)
        );
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "color", label: "Color" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists. Same two body-only divergences as
  // `create`, from the same shared constant.
  bindCommand(update, ACCESS_CARD_UPDATE_CONTRACT, {
    "Body.variables[].type": VARIABLES_ARE_JSON_ONLY,
    "Body.variables[].constraint.format": VARIABLES_ARE_JSON_ONLY
  });
}
