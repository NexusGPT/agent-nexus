import { Command } from "commander";

import { registerCollectionAttachDocumentsCommand } from "./collection/attach-documents.command";
import { registerCollectionCreateCommand } from "./collection/create.command";
import { registerCollectionDeleteCommand } from "./collection/delete.command";
import { registerCollectionDocumentsCommand } from "./collection/documents.command";
import { registerCollectionGetCommand } from "./collection/get.command";
import { registerCollectionListCommand } from "./collection/list.command";
import { registerCollectionQueryCommand } from "./collection/query.command";
import { registerCollectionRemoveDocumentCommand } from "./collection/remove-document.command";
import { registerCollectionSearchCommand } from "./collection/search.command";
import { registerCollectionSearchMultipleCommand } from "./collection/search-multiple.command";
import { registerCollectionStatsCommand } from "./collection/stats.command";
import { registerCollectionUpdateCommand } from "./collection/update.command";

/**
 * `nexus collection` — knowledge collections.
 *
 * Each leaf lives in its own file under `collection/` and binds its own
 * contract as its last act, so the generated reference block still lands after
 * the hand-written Notes for that command.
 */
export function registerCollectionCommands(program: Command): void {
  const collection = program.command("collection").description("Manage knowledge collections");

  collection.addHelpText(
    "after",
    `
A collection is a named set of DOCUMENT LINKS. It stores no content of its own,
so every write here changes which documents are reachable, never the documents.

Three facts decide whether a call does what you think:
  • "search" matches document NAMES. "query" matches document CONTENT and is the
    retrieval your agents run. Reaching for "search" to test whether a collection
    can answer a question returns nothing and looks like an empty collection.
    "search-multiple" is the multi-collection form of SEARCH — names, not content.
  • "attach-documents" EXPANDS A FOLDER TO ITS CONTENTS. A website folder, an
    imported Google Sheet folder or a plain folder attaches every document
    under it (recursively) as of that moment — the folder row itself is never
    linked, and documents added to the folder later are not pulled in.
  • Attaching and removing reach retrieval at DIFFERENT moments, and only one of
    them lags. Removing is immediate — it clears the cached document list every
    query is filtered by. Attaching is not, because the document still has to
    finish indexing, so "query" can lag an attach by minutes while
    "collection documents" is accurate immediately.`
  );

  registerCollectionListCommand(collection, program);
  registerCollectionGetCommand(collection, program);
  registerCollectionCreateCommand(collection, program);
  registerCollectionUpdateCommand(collection, program);
  registerCollectionDeleteCommand(collection, program);
  registerCollectionSearchCommand(collection, program);
  registerCollectionQueryCommand(collection, program);
  registerCollectionSearchMultipleCommand(collection, program);
  registerCollectionDocumentsCommand(collection, program);
  registerCollectionAttachDocumentsCommand(collection, program);
  registerCollectionRemoveDocumentCommand(collection, program);
  registerCollectionStatsCommand(collection, program);
}
