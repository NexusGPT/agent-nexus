import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

const REPROCESS_HELP = `
Examples:
  $ nexus document reprocess 11111111-1111-4111-8111-111111111111
  $ nexus document reprocess 11111111-1111-4111-8111-111111111111 --json

Notes:
  RUN THIS AFTER EVERY METADATA EDIT. "document update --metadata" writes the
  database column only; the search index keeps the old values until a reprocess,
  so "collection query --filter" keeps filtering on what was there before.

  ASYNCHRONOUS. Success means re-indexing started. Poll "nexus document get <id>"
  for READY.

  A FOLDER ID IS REFUSED WITH A 400, NOT IGNORED. Only leaf documents are
  re-read, and naming a folder fails the call outright — so a sweep that walks a
  tree and reprocesses every id it meets dies on the first folder rather than
  skipping it. Name the page, tab or file; get the leaves from
  "nexus document children <folder-id>".

  This re-reads the source, so it is also how a Google Sheet tab picks up edits
  made in the spreadsheet.`;

/**
 * `nexus document reprocess`
 *
 * UNBOUND ON PURPOSE — see the docblock on `registerDocumentCommands`.
 */
export function registerDocumentReprocessCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("reprocess")
    .description("Reprocess a document for embedding/indexing")
    .argument("<id>", "Document ID")
    .addHelpText("after", REPROCESS_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.reprocess(id);
        printSuccess("Document reprocessing started.", { id, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
