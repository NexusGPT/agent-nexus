import type { CreateCollectionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILLS_CREATE_COLLECTION_CONTRACT } from "../collection.contract.generated";

/** `nexus collection create` */
export function registerCollectionCreateCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("create")
    .description("Create a knowledge collection")
    .requiredOption("--name <name>", "Collection name (unique slug)")
    .option("--display-name <name>", "Human-readable display name")
    .option("--description <text>", "Collection description")
    .option("--k <number>", "Number of results to retrieve", parseInt)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection create --name "product-docs"
  $ nexus collection create --name "faq" --display-name "FAQ" --k 15
  $ nexus collection create --body '{"name":"faq","displayName":"FAQ"}'
  $ nexus collection create --body '{"name":"faq","preciseResponses":true,"includeMetadata":true}'

Notes:
  --name is a unique slug identifier. Use --display-name for the human-readable label.
  The uniqueness constraint on it is DATABASE-WIDE, not per organization, so a
  generic slug like "docs" can be refused because somebody else already took it.
  Prefer an organization-specific slug.

  --k defaults to 10 — the number of chunks retrieval pulls per query.

  k IS BOUNDED BELOW ONLY: an integer >= 1 with NO maximum. --k 0 is a 400
  reading "k: Too small: expected number to be >=1"; --k 9999 is accepted and
  stored verbatim, and every agent query on this collection then asks the
  retrieval provider for 9999 chunks. Nothing clamps it. A "k" inside --body
  must be a JSON number — "20" in quotes is a 400.

  reranker, preciseResponses and includeMetadata are --body ONLY here, with no
  flags, and the two booleans default to false. Setting them at create is the
  only way to avoid a follow-up "collection update" — which does carry a
  --reranker flag, unlike this command.

  THE CREATE RESPONSE ECHOES NOTHING YOU SET. Under --json it prints success,
  message, id and name and stops there: the server sends the whole stored
  collection back and this command keeps two fields of it. So a --body key that
  never landed and one that did print identically. Confirm the stored settings
  with "nexus collection get <id>".`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.displayName !== undefined && { displayName: opts.displayName }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.k !== undefined && { k: opts.k })
        });

        const col = await client.skills.createCollection(asRequestBody<CreateCollectionBody>(body));
        printSuccess("Collection created.", {
          id: col.id,
          name: col.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_CREATE_COLLECTION_CONTRACT);
  return leaf;
}
