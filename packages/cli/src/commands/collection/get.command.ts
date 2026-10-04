import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { SKILLS_GET_COLLECTION_CONTRACT } from "../collection.contract.generated";

/** `nexus collection get` */
export function registerCollectionGetCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("get")
    .description("Get collection details")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection get 11111111-1111-4111-8111-111111111111
  $ nexus collection get 11111111-1111-4111-8111-111111111111 --json

Notes:
  Reranker "none" means NO RERANKER IS SET, and retrieval then returns the raw
  similarity order. It is a model name when set, never a yes/no.

  k is how many chunks a query pulls. Documents is the same stored counter the
  list shows — "collection stats <id>" for the live number.

  This does not list the documents. Use "nexus collection documents <id>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const col = await client.skills.getCollection(id);
        printRecord(col, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "displayName", label: "Display Name" },
          { key: "description", label: "Description" },
          { key: "k", label: "k (results)" },
          // A model name, not a toggle — "yes" hid WHICH reranker was set.
          { key: "reranker", label: "Reranker", format: (v) => (v ? String(v) : "none") },
          { key: "documentCount", label: "Documents" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_GET_COLLECTION_CONTRACT);
  return leaf;
}
