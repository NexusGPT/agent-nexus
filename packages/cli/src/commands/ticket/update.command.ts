import type { UpdateTicketBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  TICKET_UPDATE__BODY_PRIORITY,
  TICKET_UPDATE__BODY_TYPE,
  TICKET_UPDATE_CONTRACT
} from "../ticket.contract.generated";
import { formatLabels } from "./_shared/format-labels";
import { parseLabels } from "./_shared/parse-labels";

const UPDATE_HELP = `
Examples:
  $ nexus ticket update NEX-3469 --priority URGENT
  $ nexus ticket update NEX-3469 --labels "CUE,Backend"
  $ nexus ticket update NEX-3469 --labels ""
  $ nexus ticket update NEX-3469 --title "Updated title" --type BUG
  $ nexus ticket update NEX-3469 --status "In Progress"
  $ nexus ticket update NEX-3469 --status Canceled
  $ nexus ticket update NEX-3469 --data '{"priority":"URGENT"}'

Notes:
  Uses --data (not --body) for JSON input, like "ticket create".

  --labels REPLACES THE TICKET'S LABELS WHOLESALE — it does not add. Sending a
  subset removes the rest; --labels "" clears them all. Read the current set
  with "nexus ticket get" and send it back plus your addition — and that
  addition must already exist on the team, since a name matching no label is
  refused rather than created. The type label is preserved regardless and
  cannot be passed here.

  --description REPLACES THE WHOLE DESCRIPTION, INCLUDING THE CONTEXT BLOCK the
  ticket was filed with. That block is where context lives, so overwriting it
  is how a ticket loses its reproduction steps. There is no context field on
  update: to keep it, read the description first and re-send it with your edit.

  --status IS A LINEAR WORKFLOW-STATE NAME and is validated against the team's
  real states; an unknown one is refused with the allowed set. Read that set
  before you write against it — the states are configured per team and are not
  the generic Linear defaults, so a name that reads as obviously right can be
  one the team does not define. "nexus ticket list --status zzz" prints them.

  VERIFY WITH "nexus ticket get". Create and update both transform silently —
  unknown context keys dropped, a long requestBody truncated — and the response
  here does not distinguish what was kept from what was sent.

  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING — every field is optional.
  A flag always overrides the same field in --data.`;

/** `nexus ticket update` */
export function registerTicketUpdateCommand(ticket: Command, program: Command): Command {
  const leaf = ticket
    .command("update")
    .description("Update a ticket")
    .argument("<id>", 'Ticket id (see "nexus ticket list")')
    .option("--title <title>", "Updated title")
    .addOption(enumOption("--type <type>", "Updated type", TICKET_UPDATE__BODY_TYPE))
    .addOption(
      enumOption("--priority <priority>", "Updated priority", TICKET_UPDATE__BODY_PRIORITY)
    )
    .option("--description <text>", "Updated description")
    .option(
      "--status <status>",
      'Transition to a workflow-state name defined by the team — run "nexus ticket list --status zzz" to print the real set'
    )
    .option(
      "--labels <list>",
      "Comma-separated Linear labels; replaces the ticket's labels (empty value clears them)"
    )
    .option("--data <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        const base = await resolveBody(opts.data);
        const body = mergeBodyWithFlags(base, {
          ...(opts.title !== undefined && { title: opts.title }),
          ...(opts.type !== undefined && { type: opts.type }),
          ...(opts.priority !== undefined && { priority: opts.priority }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.status !== undefined && { status: opts.status }),
          ...(opts.labels !== undefined && { labels: parseLabels(opts.labels) })
        });

        const t = await client.tickets.update(id, asRequestBody<UpdateTicketBody>(body));
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "identifier", label: "Identifier" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "labels", label: "Labels", format: formatLabels },
          { key: "url", label: "URL" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, TICKET_UPDATE_CONTRACT);
  return leaf;
}
