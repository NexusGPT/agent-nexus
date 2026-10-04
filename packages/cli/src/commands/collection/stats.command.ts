import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { SKILLS_GET_COLLECTION_STATISTICS_CONTRACT } from "../collection.contract.generated";

/** `nexus collection stats` */
export function registerCollectionStatsCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("stats")
    .description("Get collection statistics")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection stats 11111111-1111-4111-8111-111111111111
  $ nexus collection stats 11111111-1111-4111-8111-111111111111 --json

Notes:
  Counted live from the current links, so this is accurate the instant an attach
  or remove returns — unlike the DOCS column of "collection list".

  embeddedCount is the documents that are actually retrievable. documentCount
  minus embeddedCount minus pendingCount is the number that ERRORED, and those
  never contribute to a query no matter how long you wait.

  DIRECT LINKS ONLY, so these counts do not include the children retrieval
  reaches. lastUpdatedAt is null for an empty collection.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const stats = await client.skills.getCollectionStatistics(id);
        printRecord(stats);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_GET_COLLECTION_STATISTICS_CONTRACT);
  return leaf;
}
