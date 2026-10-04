import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { formatLabels } from "./_shared/format-labels";

/** `nexus ticket get` */
export function registerTicketGetCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("get")
    .description("Get ticket details")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket get NEX-3469
  $ nexus ticket get NEX-3469 --json

Notes:
  This reads the profile's ACTIVE organization only, so a ticket filed under
  another organization answers 404. Find it with "nexus ticket list --all-orgs"
  — every row carries its url and, in --json, its organizationId. Then either
  open the url, or switch with "nexus auth use-org <orgId>" and read it here.

  TAKES THE IDENTIFIER OR THE UUID. "NEX-42" is what you normally have; the
  identifier is global across organizations, which is why the 404 above is
  about permission, not about the identifier being unknown.

  THE ONLY COMMAND THAT RETURNS description AND context. context comes back
  reconstructed by parsing the Linear description, so a ticket whose
  description was hand-edited in Linear can read back with fields missing or
  changed. Treat context on read as best-effort, and the Linear issue as the
  source of truth.

  Attachments and comments are separate reads: "nexus ticket comments <id>",
  "nexus ticket attachments <id>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.tickets.get(id);
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "labels", label: "Labels", format: formatLabels },
          { key: "url", label: "URL" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          // Printed because it is the answer to a question the next command
          // asks: an archived ticket is read-only, so `ticket comment` and
          // `ticket attach` on it answer 409. Without this row the refusal
          // arrives with nothing on the read to explain it.
          { key: "archivedAt", label: "Archived" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
