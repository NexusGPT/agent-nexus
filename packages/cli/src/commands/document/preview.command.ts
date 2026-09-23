import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { DOCUMENT_PREVIEW_CONTRACT } from "../document.contract.generated";

const PREVIEW_HELP = `
Examples:
  $ nexus document preview 11111111-1111-4111-8111-111111111111
  $ nexus document preview 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE URL IS SIGNED AND EXPIRES — expiresIn says when, currently 3600 seconds.
  Never store it; re-run this command for a fresh one.

  Same object as "document download", without the Content-Disposition header,
  so a browser displays it inline. Documents with no stored file — text
  documents, crawled pages, folders — answer 404 on both.`;

/**
 * `nexus document preview`
 *
 * 🚨 BOUND ON PURPOSE THOUGH IT IS NOT SWEEPABLE — DO NOT DELETE THE
 * `bindCommand` CALL BELOW. See the docblock on `registerDocumentCommands` for
 * why this leaf and `download` are `declared-unsweepable` rather than unbound.
 */
export function registerDocumentPreviewCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("preview")
    .description("Get a preview URL for inline viewing of a document")
    .argument("<id>", "Document ID")
    .addHelpText("after", PREVIEW_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.getPreviewUrl(id);
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
  bindCommand(leaf, DOCUMENT_PREVIEW_CONTRACT);
  return leaf;
}
