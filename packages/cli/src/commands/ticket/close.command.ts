import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { resolveInputValue } from "../../util/stdin";

/** `nexus ticket close` */
export function registerTicketCloseCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("close")
    .description("Close a ticket by transitioning it to a terminal status")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .option("--as <status>", "Workflow-state name to close as", "Canceled")
    .option("--comment <text-or-->", "Optional comment to add before closing ('-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket close NEX-3469
  $ nexus ticket close NEX-3469 --as Canceled --comment "Duplicate of NEX-3468"

Notes:
  IT CLOSES AS Canceled BY DEFAULT, WHICH READS AS "we are not doing this".
  That is the right state for a ticket being dropped and the wrong one for work
  that shipped.
  THERE IS NO "Done" STATE TO PASS. --as takes a workflow-state name the LINEAR
  TEAM defines, and the generic Linear vocabulary is not what this team uses —
  so the obvious --as Done is refused. Print the real set before closing
  anything as shipped:

    $ nexus ticket list --status zzz

  --as IS A WORKFLOW-STATE NAME, so this is "ticket update --status" with a
  default. Nothing checks that the state you name is terminal — --as Backlog
  is accepted and reopens the ticket.
  THE COMMENT IS POSTED FIRST, AS A SEPARATE CALL. If the transition then fails
  — an unknown --as, a permission error — the comment is already on the ticket
  and is not rolled back. Re-running would post it twice.
  --comment - reads the comment body from stdin.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.comment !== undefined) {
          const commentBody = await resolveInputValue(opts.comment);
          await client.tickets.addComment(id, { body: commentBody });
        }

        const t = await client.tickets.update(id, { status: opts.as });
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "url", label: "URL" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
