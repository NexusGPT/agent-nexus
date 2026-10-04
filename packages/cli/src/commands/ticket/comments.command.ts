import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus ticket comments` */
export function registerTicketCommentsCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("comments")
    .description("List comments on a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comments NEX-3469
  $ nexus ticket comments NEX-3469 --json

Notes:
  THE BODY COLUMN IS TRUNCATED TO 50 CHARACTERS in the table. Use --json to
  read a comment in full — the table is a index, not the content.
  Unpaginated — there are no --limit / --page options here.
  THE AUTHOR COLUMN IS "authorName" IN --json, not "author". A script reading
  .author gets undefined on every row and reads it as an unattributed comment.
  IT IS null FOR A COMMENT WRITTEN BY AN INTEGRATION, and renders blank rather
  than saying so. Every comment posted with "nexus ticket comment" is written by
  an integration, so this column cannot tell you who ran the command.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tickets.listComments(id);
        const comments = result.comments ?? result;

        printList(comments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "authorName", label: "AUTHOR", width: 20 },
          { key: "body", label: "BODY", width: 50 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
