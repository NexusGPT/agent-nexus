import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { DOCUMENT_DOWNLOAD_CONTRACT } from "../document.contract.generated";

const DOWNLOAD_HELP = `
Examples:
  $ nexus document download 11111111-1111-4111-8111-111111111111
  $ nexus document download 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE URL IS SIGNED AND EXPIRES — expiresIn says when, currently 3600 seconds.
  Fetch it in the same run; a stored URL stops working and re-running this
  command is how you get a fresh one.

  ONLY DOCUMENTS WITH A STORED FILE HAVE ONE. A text document, a crawled page or
  a folder has no file behind it and answers 404 here. Read those through the
  dashboard or re-create them from the source.

  This is the same URL as "document preview", plus a Content-Disposition header
  so a browser saves it instead of displaying it.`;

/**
 * `nexus document download`
 *
 * 🚨 BOUND ON PURPOSE THOUGH IT IS NOT SWEEPABLE — DO NOT DELETE THE
 * `bindCommand` CALL BELOW. See the docblock on `registerDocumentCommands` for
 * why this leaf and `preview` are `declared-unsweepable` rather than unbound.
 */
export function registerDocumentDownloadCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("download")
    .description("Get a signed download URL for a document")
    .argument("<id>", "Document ID")
    .addHelpText("after", DOWNLOAD_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.getDownloadUrl(id);
        printRecord(result, [
          { key: "url", label: "URL" },
          { key: "fileName", label: "File Name" },
          { key: "mimeType", label: "MIME Type" },
          { key: "expiresIn", label: "Expires In (s)" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, DOCUMENT_DOWNLOAD_CONTRACT);
  return leaf;
}
