import { Command } from "commander";

import { registerTicketAttachCommand } from "./ticket/attach.command";
import { registerTicketAttachmentsCommand } from "./ticket/attachments.command";
import { registerTicketCloseCommand } from "./ticket/close.command";
import { registerTicketCommentCommand } from "./ticket/comment.command";
import { registerTicketCommentsCommand } from "./ticket/comments.command";
import { registerTicketCreateCommand } from "./ticket/create.command";
import { registerTicketGetCommand } from "./ticket/get.command";
import { registerTicketListCommand } from "./ticket/list.command";
import { registerTicketUpdateCommand } from "./ticket/update.command";

/**
 * `nexus ticket` — tickets, which are Linear issues.
 *
 * Each leaf lives in its own file under `ticket/` and binds its own contract as
 * its last act, so the generated reference block still lands after the
 * hand-written Notes for that command.
 */
export function registerTicketCommands(program: Command): void {
  const ticket = program
    .command("ticket")
    .description("Manage tickets (bugs, feature requests, improvements)");

  ticket.addHelpText(
    "after",
    `
A TICKET IS A LINEAR ISSUE. Every organization files into the SAME Linear
team, so identifiers are global and a ticket raised under another organization
is invisible to a single-org read — "ticket list --all-orgs" before you file,
or you will duplicate one.

--data, NOT --body, ON create AND update. This namespace is the exception in
the CLI. "ticket comment --body" is a third thing again: plain comment text,
not JSON.

STATUS IS A LINEAR WORKFLOW-STATE NAME, matched case-insensitively against the
states the team actually has. An unknown name is refused with the full allowed
set, so a bad filter never comes back as an empty page.

WHAT IS REDACTED AND WHAT IS NOT: only context.requestBody and
context.responseBody are scrubbed, and only where a KEY inside that JSON looks
secret. A token in --title, --description or a comment reaches Linear
verbatim. Redaction is not a safety net — do not paste secrets.`
  );

  registerTicketListCommand(ticket, program);
  registerTicketGetCommand(ticket, program);
  registerTicketCreateCommand(ticket, program);
  registerTicketUpdateCommand(ticket, program);
  registerTicketCloseCommand(ticket, program);
  registerTicketCommentCommand(ticket, program);
  registerTicketCommentsCommand(ticket, program);
  registerTicketAttachCommand(ticket, program);
  registerTicketAttachmentsCommand(ticket, program);
}
