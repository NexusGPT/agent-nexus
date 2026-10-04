import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { readUploadBuffer } from "../../util/upload-file";

/** `nexus ticket attach` */
export function registerTicketAttachCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("attach")
    .description("Upload a file attachment to a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .requiredOption("--file <path>", "Path to the file to upload")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attach NEX-3469 --file ./screenshot.png
  $ nexus ticket attach NEX-3469 --file ~/Downloads/error-log.txt

Notes:
  THE WHOLE FILE IS READ INTO MEMORY AND UPLOADED IN ONE REQUEST. There is no
  chunking and no resume, so a large file fails as a single timeout — raise the
  global --timeout <seconds> rather than retrying.
  A MISSING PATH EXITS NON-ZERO BEFORE ANY REQUEST, printing the resolved
  absolute path. That is a local check, not a server answer — the code says so,
  and "nexus --help" carries the table.
  THE FILE IS NOT SCANNED OR REDACTED. A log with credentials in it goes to
  Linear as-is; the redaction on "ticket create" covers context bodies only.
  Confirm with "nexus ticket attachments <id>" — the upload response alone is
  not proof the attachment is listed.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const buffer = readUploadBuffer(opts.file);
        const { File: NodeFile } = await import("node:buffer");
        const fileName = path.basename(path.resolve(opts.file));
        const file = new NodeFile([buffer], fileName);

        const result = await client.tickets.uploadAttachment(id, file);
        printSuccess("Attachment uploaded.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
