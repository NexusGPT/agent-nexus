import fs from "node:fs";
import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { parseMetadataPairs } from "../../util/metadata";
import { collectMetadata } from "./collect-metadata";

const UPLOAD_HELP = `
Examples:
  $ nexus document upload ./report.pdf
  $ nexus document upload ./data.csv --description "Q4 sales data"
  $ nexus document upload ./faq-fr.md --metadata language=fr --metadata content_type=faq-mobile
  $ nexus document upload ./manual.txt --json

Notes:
  For .md/.txt files, YAML frontmatter (--- block at the top) is read as metadata
  server-side. Explicit --metadata flags override matching frontmatter keys.

  UPLOADING IS NOT INDEXING. The document comes back PENDING and is embedded
  afterwards; poll "nexus document get <id>" for READY before attaching it or
  expecting a query to find it.

  THE UPLOAD LANDS IN THE KNOWLEDGE BASE, NOT IN A COLLECTION. Attach it with
  "nexus collection attach-documents <collection-id> --document-ids <id>".

  READ type; mimeType IS RESOLVED FROM THE FILENAME. This CLI sends the bytes
  with no content type declared, so the server resolves mimeType from the
  file's extension — a .pdf comes back "application/pdf", a .csv "text/csv".
  An extension it does not recognise still lands on the multipart default,
  "application/octet-stream", so mimeType is a hint and type is the answer:
  the server classifies the document itself and reports that as type.

  Metadata set here is what "collection query --filter" matches on. Adding it
  later needs a "document reprocess" to take effect, so set it now.`;

/**
 * `nexus document upload`
 *
 * UNBOUND ON PURPOSE — see the docblock on `registerDocumentCommands`: binding
 * a mutating leaf makes its method provable and moves it to `bound-but-mutates`,
 * which is a truer reason and still an excluded row.
 */
export function registerDocumentUploadCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("upload")
    .description("Upload a file as a document")
    .argument("<file-path>", "Path to the file")
    .option("--description <text>", "Document description")
    .option(
      "--metadata <key=value...>",
      "Filterable metadata (repeatable). Overrides matching YAML frontmatter keys.",
      collectMetadata,
      []
    )
    .addHelpText("after", UPLOAD_HELP)
    .action(async (filePath: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(filePath);

        if (!fs.existsSync(absPath)) {
          process.exitCode = refuse(
            `File not found: ${absPath}`,
            "Pass a path that exists, relative to the current directory or absolute."
          );
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

        const metadataFlags = opts.metadata as string[];
        const metadata = metadataFlags.length > 0 ? parseMetadataPairs(metadataFlags) : undefined;

        const doc = await client.documents.uploadFile(blob, fileName, opts.description, metadata);
        printSuccess("Document uploaded.", {
          id: doc.id,
          name: doc.name ?? fileName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
