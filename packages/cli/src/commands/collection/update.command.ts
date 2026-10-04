import type { UpdateCollectionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILLS_UPDATE_COLLECTION_CONTRACT } from "../collection.contract.generated";

/** `nexus collection update` */
export function registerCollectionUpdateCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("update")
    .description("Update a collection")
    .argument("<id>", "Collection ID")
    .option("--display-name <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--k <number>", "Number of results", parseInt)
    .option("--reranker <model>", "Reranking model name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --display-name "Updated FAQ"
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --k 20 --reranker zerank-1
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --body '{"displayName":"Updated"}'

Notes:
  --reranker takes a reranking MODEL NAME, passed through to the retrieval
  provider. It is not an on/off switch, and "--reranker true" is rejected.

  Only the fields you send are written; everything you omit keeps its stored
  value. There is no way to clear --description or --reranker back to unset here.

  preciseResponses and includeMetadata are --body only, as on create.

  A "name" in --body IS ACCEPTED AND SILENTLY IGNORED. The slug is fixed at
  creation and this route does not carry it — the call returns success and the
  name is unchanged. Recreate the collection if you need a different slug.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName !== undefined) flags.displayName = opts.displayName;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.k !== undefined) flags.k = opts.k;
        if (opts.reranker !== undefined) flags.reranker = opts.reranker;

        const body = mergeBodyWithFlags(base, flags);

        await client.skills.updateCollection(id, asRequestBody<UpdateCollectionBody>(body));
        printSuccess("Collection updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_UPDATE_COLLECTION_CONTRACT);
  return leaf;
}
