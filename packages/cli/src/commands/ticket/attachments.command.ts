import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus ticket attachments` */
export function registerTicketAttachmentsCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("attachments")
    .description("List attachments on a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket attachments NEX-3469
  $ nexus ticket attachments NEX-3469 --json

Notes:
  THIS IS THE VERIFICATION STEP FOR "ticket attach" — a 2xx on the upload is
  not proof the attachment landed on the ticket.
  Unpaginated. There is no download and no delete command: open the ticket's
  url for the file itself.

  THE ROW IS {id, filename, url, contentType, size, createdAt}. The table prints
  four of those; url and size are --json only, and url is the field you actually
  need, because there is no download here.

  contentType AND size ARE NULLABLE, and a row with both null is not a broken
  upload. An attachment does not have to be a file this CLI sent: anything that
  links itself to the ticket lands in the same list, and then filename is
  whatever that system called it — a pull request title, a document name —
  rather than a name on disk. Branch on url, never on contentType.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tickets.listAttachments(id);
        const attachments = result.attachments ?? result;
        printList(attachments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "filename", label: "FILE", width: 30 },
          { key: "contentType", label: "TYPE", width: 15 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
