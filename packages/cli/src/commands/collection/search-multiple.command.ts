import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { parseIdList } from "../../util/ids";
import { SKILLS_SEARCH_MULTIPLE_COLLECTIONS_CONTRACT } from "../collection.contract.generated";

/** `nexus collection search-multiple` */
export function registerCollectionSearchMultipleCommand(
  collection: Command,
  program: Command
): Command {
  const leaf = collection
    .command("search-multiple")
    .description("Search several collections by document name (slug match — not content)")
    .requiredOption("--query <query>", "Substring to match against document names")
    .requiredOption("--collection-ids <ids>", "Comma-separated collection IDs")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Matches document NAMES, exactly like "nexus collection search" — this is the
multi-collection form of SEARCH, not of "query". There is no multi-collection
content retrieval: to search CONTENT across several collections, run
"nexus collection query" once per collection.

Examples:
  $ nexus collection search-multiple --query "pricing" --collection-ids col-1,col-2
  $ nexus collection search-multiple --query "reset password" --collection-ids col-1 --limit 5 --json

Notes:
  EVERY HIT SCORES 1.000 here too — this endpoint does not rank.

  METADATA IS ALWAYS null HERE, and this is the only collection read where that
  is a property of the ROUTE rather than of your arguments: the multi-collection
  search schema carries no includeMetadata field and the server hardcodes the
  null. "collection search" and "collection query" both take --include-metadata,
  so reaching metadata means running one of those per collection.

  The results do not say which collection each hit came from. Search the
  collections one at a time when that matters.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const collectionIds = parseIdList(String(opts.collectionIds));
        const result = await client.skills.searchMultipleCollections({
          query: opts.query,
          collectionIds,
          limit: opts.limit
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

  bindCommand(leaf, SKILLS_SEARCH_MULTIPLE_COLLECTIONS_CONTRACT);
  return leaf;
}
