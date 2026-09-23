import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { DOCUMENT_GET_CONTRACT } from "../document.contract.generated";

const GET_HELP = `
Examples:
  $ nexus document get 11111111-1111-4111-8111-111111111111
  $ nexus document get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS THE POLL TARGET for every asynchronous import. Status READY is
  terminal success; ERROR is terminal failure.

  ON A LEAF DOCUMENT, POLL status — NOT Progress. processingProgress is written
  by the website crawler onto the FOLDER it creates, and by nothing else, so on
  a page, a tab, an uploaded file or a text document it reads 0 even once the
  document is READY. The Progress row here is that field: 0 on a leaf is normal
  and is not a stalled import.

  FOR A FOLDER, READ THE CHILD COUNTERS, NOT THE STATUS. A website folder flips
  to READY when the crawl finishes, while its pages are still PENDING and not
  yet indexed. --json exposes totalChildren, errorChildren and
  processingProgress; the folder is genuinely done when processingProgress is
  100 and errorChildren is 0.

  A FOLDER THAT REPORTS READY WITH ZERO CHILDREN FETCHED NOTHING. That is the
  shape a mis-specified crawl takes — see "document add-website".

  This does not return the document's text. Use "nexus document download <id>".`;

/** `nexus document get` */
export function registerDocumentGetCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("get")
    .description("Get document details")
    .argument("<id>", "Document ID")
    .addHelpText("after", GET_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const doc = await client.documents.get(id);
        printRecord(doc, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "processingProgress", label: "Progress" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, DOCUMENT_GET_CONTRACT);
  return leaf;
}
