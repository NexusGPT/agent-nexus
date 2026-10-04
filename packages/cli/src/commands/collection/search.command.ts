import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { SKILLS_SEARCH_COLLECTION_CONTRACT } from "../collection.contract.generated";

/** `nexus collection search` */
export function registerCollectionSearchCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("search")
    .description("Search a collection by document name (slug match — not content)")
    .argument("<id>", "Collection ID")
    .requiredOption("--query <query>", "Substring to match against document names")
    .option("--limit <number>", "Max results", parseInt)
    .option("--include-metadata", "Include each document's stored search metadata")
    .addHelpText(
      "after",
      `
Matches document NAMES only (case-insensitive substring). To search document
CONTENT (the semantic retrieval your agents use), use "nexus collection query".

Examples:
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "invoice"
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "pricing" --limit 5 --json
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "invoice" --include-metadata

Notes:
  EVERY HIT SCORES 1.000. This endpoint does not rank — the score column is a
  constant, not a relevance figure, and a run of 1.000s is not a run of perfect
  matches. Use "collection query" whenever ranking means anything to you.

  --query is a case-insensitive SUBSTRING of the document name. It is not a
  glob, not a regex and not tokenised, so "reset PIN" matches only a name that
  literally contains "reset PIN". --limit defaults to 10.

  A CRAWLED PAGE IS NAMED AFTER THE LAST SEGMENT OF ITS URL, so this command
  finds /guides/setup by "setup" and CANNOT find a home page at all — a bare
  domain root has no segment and is stored with an empty name. A collection
  built from a website crawl therefore looks empty here while answering
  "collection query" perfectly. Search CONTENT for crawled material.

  metadata IS A LITERAL null WITHOUT --include-metadata. With the flag it is the
  DOCUMENT's own attribute bag — the same one "nexus document get --json" prints
  under this same name — so it still reads null for a document that carries
  none. The flag on "collection query" fills the same field from a DIFFERENT
  source: the snippet's retrieval-provider payload, not the document's column.
  So a null here never means "you forgot the flag".

  READ IT UNDER --json. The table output is score and name only, so
  --include-metadata on its own changes nothing you can see.

  Only documents linked DIRECTLY to the collection are searched.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.searchCollection(id, {
          query: opts.query,
          limit: opts.limit,
          includeMetadata: opts.includeMetadata
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const results = result.results ?? result;
          if (Array.isArray(results)) {
            for (const r of results) {
              console.log(
                `─ ${r.score?.toFixed(3) ?? "N/A"}  ${r.text?.slice(0, 100) ?? JSON.stringify(r).slice(0, 100)}...`
              );
            }
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_SEARCH_COLLECTION_CONTRACT);
  return leaf;
}
