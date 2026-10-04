import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { SKILLS_LIST_COLLECTION_DOCUMENTS_CONTRACT } from "../collection.contract.generated";

/** `nexus collection documents` */
export function registerCollectionDocumentsCommand(collection: Command, program: Command): Command {
  const leaf = addPaginationOptions(
    collection
      .command("documents")
      .description("List documents in a collection")
      .argument("<id>", "Collection ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus collection documents 11111111-1111-4111-8111-111111111111
  $ nexus collection documents 11111111-1111-4111-8111-111111111111 --limit 20 --json

Notes:
  DIRECT LINKS ONLY. Children of a linked document are not listed here even
  though retrieval reaches them — list those with "nexus document children <id>".

  This reads the database, so it is the authoritative answer right after an
  attach or a remove, in a way "collection query" is not.

  STATUS is the answer to "why does query return nothing": a document only
  contributes to retrieval once it reads READY.

  Soft-deleted documents are excluded, so a document deleted elsewhere leaves
  this list silently rather than appearing as a broken row.

  --json IS {data: [...], meta: {total, page, limit, totalPages, paging}}, NOT
  a bare array — and "collection list", the command beside it, IS a bare array.
  Read meta.paging here rather than counting the rows you got.`
      )
  );

  leaf.action(async (id: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.skills.listCollectionDocuments(
        id,
        getPaginationParams(opts)
      );

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  bindCommand(leaf, SKILLS_LIST_COLLECTION_DOCUMENTS_CONTRACT);
  return leaf;
}
