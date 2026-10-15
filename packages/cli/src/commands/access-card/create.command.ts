import type { CreateAccessCardBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { ACCESS_CARD_CREATE_CONTRACT } from "../access-card.contract.generated";
import { VARIABLES_ARE_JSON_ONLY } from "./_shared/variables-are-json-only";
import { CREATE_NOTES } from "./copy/create-notes";

/** `nexus access-card create` */
export function registerAccessCardCreateCommand(accessCard: Command, program: Command): void {
  const create = accessCard
    .command("create")
    .description("Create a new access card")
    .requiredOption("--credential-id <id>", "Credential ID (required)")
    .requiredOption("--name <name>", "Card name (required)")
    .option("--description <text>", "Card description")
    .option("--color <color>", "Card color (slate, blue, green, etc.)")
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_NOTES)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.color !== undefined && { color: opts.color })
        });

        if (!body.policies) {
          body.policies = {};
        }

        const card = await client.credentials.cards.create(
          opts.credentialId,
          asRequestBody<CreateAccessCardBody>(body)
        );
        printRecord(card, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "isMaster", label: "Master" },
          { key: "color", label: "Color" },
          { key: "credentialId", label: "Credential ID" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists. The two body-only divergences are
  // declared from one shared constant — see `_shared/variables-are-json-only`.
  bindCommand(create, ACCESS_CARD_CREATE_CONTRACT, {
    "Body.variables[].type": VARIABLES_ARE_JSON_ONLY,
    "Body.variables[].constraint.format": VARIABLES_ARE_JSON_ONLY
  });
}
