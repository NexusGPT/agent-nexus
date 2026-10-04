import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { SKILLS_REMOVE_COLLECTION_DOCUMENT_CONTRACT } from "../collection.contract.generated";

/** `nexus collection remove-document` */
export function registerCollectionRemoveDocumentCommand(
  collection: Command,
  program: Command
): Command {
  const leaf = collection
    .command("remove-document")
    .description("Remove a document from a collection")
    .argument("<id>", "Collection ID")
    .argument("<document-id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection remove-document 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222

Notes:
  REMOVES THE LINK, NOT THE DOCUMENT. The document stays in the knowledge base,
  stays in every other collection holding it, and is still listed by
  "nexus document list". Use "nexus document delete" to remove the document.

  SUCCESS IS NOT EVIDENCE ANYTHING WAS REMOVED. This is idempotent: a document
  that was never in the collection reports removed just the same. Only
  "nexus collection documents <id>" answers whether the link is gone.

  RETRIEVAL STOPS AT THE NEXT QUERY. This route clears the link AND the cached
  membership that "collection query" and any agent reading this collection are
  filtered by, so the document is out of reach on the next query rather than
  minutes later. No flag is needed.

  Removing every document leaves an empty collection, not a deleted one.`
    )
    .action(async (id: string, documentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.removeCollectionDocument(id, documentId);
        printSuccess("Document removed from collection.", { id, documentId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_REMOVE_COLLECTION_DOCUMENT_CONTRACT);
  return leaf;
}
