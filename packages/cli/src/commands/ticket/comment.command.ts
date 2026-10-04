import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { resolveInputValue } from "../../util/stdin";

/** `nexus ticket comment` */
export function registerTicketCommentCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("comment")
    .description("Add a comment to a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .requiredOption("--body <text-or-->", "Comment body (text or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus ticket comment NEX-3469 --body "This is fixed in v2.1"
  $ echo "Detailed comment" | nexus ticket comment NEX-3469 --body -

Notes:
  --body HERE IS COMMENT TEXT, NOT JSON. It is the one --body in this namespace
  — create and update take --data — and passing JSON just posts that JSON as
  the comment's text.
  "-" reads the body from stdin, which is how you post anything multi-line.
  NOTHING IS REDACTED IN A COMMENT. The scrubbing that applies to
  context.requestBody on create does not apply here; a pasted token goes to
  Linear as typed.
  Comments cannot be edited or deleted through this API.

  YOUR COMMENT IS NOT ATTRIBUTED TO YOU. Every comment this route posts lands
  under ONE shared internal account, whichever key sent it, and nothing in the
  response says so. Nobody reading the ticket can tell which person or which
  automation wrote it, and there is no flag that changes this. Sign the body
  yourself when the author matters:

    $ nexus ticket comment NEX-3469 --body "[deploy-bot] retried, green on 2nd run"

  A FAILURE HERE NAMES ITS CAUSE. When the comment does not post, the error says
  what went wrong — a rate limit, a rejected body, an upstream fault — so read
  it rather than retrying blind. Retrying a rate limit immediately just spends
  the next attempt.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveInputValue(opts.body);
        await client.tickets.addComment(id, { body });
        printSuccess("Comment added.", { ticketId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
