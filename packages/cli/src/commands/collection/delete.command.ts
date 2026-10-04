import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { SKILLS_DELETE_COLLECTION_CONTRACT } from "../collection.contract.generated";

/** `nexus collection delete` */
export function registerCollectionDeleteCommand(collection: Command, program: Command): Command {
  const leaf = confirmable(collection.command("delete"))
    .description("Delete a collection")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection delete 11111111-1111-4111-8111-111111111111
  $ nexus collection delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THE DOCUMENTS SURVIVE. This deletes the collection and its document links.
  Every document stays in the knowledge base, keeps its place in any other
  collection, and is still listed by "nexus document list". Nothing here removes
  a document — use "nexus document delete" for that.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete collection ${id}?`, opts))) return;

        await client.skills.deleteCollection(id);
        printSuccess("Collection deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_DELETE_COLLECTION_CONTRACT);
  return leaf;
}
