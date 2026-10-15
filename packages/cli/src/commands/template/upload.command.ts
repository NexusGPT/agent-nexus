import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { readUploadBlob } from "../../util/upload-file";

/** `nexus template upload` */
export function registerTemplateUploadCommand(template: Command, program: Command): void {
  template
    .command("upload")
    .description("Upload a file to a document template")
    .argument("<id>", "Template ID")
    .requiredOption("--file <path>", "Path to the template file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template upload 11111111-1111-4111-8111-111111111111 --file ./invoice.docx
  $ nexus template upload 11111111-1111-4111-8111-111111111111 --file ./deck.pptx

Notes:
  THIS STEP STORES THE FILE AND READS NOTHING OUT OF IT. It uploads the file to
  storage and writes fileUrl on the template; it never runs the placeholder
  parser, so inputFormat is not written here and stays null. Checking
  "nexus template get <id> --json" afterwards proves nothing about your file —
  the null is this route's behaviour, not a verdict on your placeholders.

  THE PLACEHOLDER PARSER IS DASHBOARD-ONLY. It sits behind an internal route the
  dashboard calls after uploading, and the dashboard is what stores the result.
  No route in this API does either half, so there is no CLI equivalent and
  nothing to wait for. Read the variable names out of the file itself; only the
  dashboard can put them on the template.

  UPLOAD THE FILE FORMAT THE TEMPLATE'S type PROMISED. A .docx belongs to the
  WORD_* types, a .pptx to POWERPOINT_TEMPLATE, an .xlsx to EXCEL_TEMPLATE.
  Generation reads the type, not the file extension, so a mismatch surfaces at
  generate time rather than here.

  UPLOADING AGAIN REPLACES THE FILE AND DELETES THE OLD ONE from storage. The
  placeholders that matter change with it, silently: a generate call written
  against the previous file's names still returns 200 and simply stops filling
  them.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const blob = readUploadBlob(opts.file);
        const fileName = path.basename(path.resolve(opts.file));

        await client.skills.uploadDocumentTemplateFile(id, blob, fileName);
        printSuccess("File uploaded to template.", {
          templateId: id,
          fileName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
