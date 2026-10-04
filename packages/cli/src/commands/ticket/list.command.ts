import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  TICKET_LIST__PARAMS_PRIORITY,
  TICKET_LIST__PARAMS_TYPE,
  TICKET_LIST_CONTRACT
} from "../ticket.contract.generated";
import { listAcrossOrganizations } from "./_shared/list-across-organizations";
import { TICKET_COLUMNS } from "./_shared/ticket-columns";

const LIST_HELP = `
Examples:
  $ nexus ticket list
  $ nexus ticket list --type BUG --priority HIGH
  $ nexus ticket list --status "Todo,In Progress"
  $ nexus ticket list --search "login" --json
  $ nexus ticket list --all-orgs --search "webhook"

Notes:
  READ THE STATUS SET, NEVER ASSUME IT. Statuses are the workflow states
  configured on the Linear team, so the team renames and adds them and any list
  written down here is a lie waiting to happen. They are matched
  case-insensitively, and a name the team does not define is rejected with the
  COMPLETE allowed set rather than an empty page — so the fastest way to see
  today's states is to ask for one that cannot exist:

    $ nexus ticket list --status zzz

  The states are not the generic Linear defaults. Do not guess "Done".

  Without --all-orgs, results come from the profile's active organization only.
  Every organization is backed by the same ticket workspace, so a ticket filed
  under another organization is invisible to a single-org search — use
  --all-orgs before filing to avoid duplicates.

  --all-orgs needs a personal (cross-org) token; an organization-scoped key is
  refused with a 403. Get one from Settings -> API Keys -> Personal Tokens,
  then run "nexus auth login".

  --all-orgs IS BEST-EFFORT AND CAN ANSWER SHORT. An organization it could not
  read is SKIPPED rather than failing the call, so "no such ticket" may just
  mean "not in the orgs that answered". A warning naming the skipped ids goes
  to STDERR, and they also travel in meta.skippedOrganizationIds under --json —
  check it before concluding a ticket does not exist.

  NO DESCRIPTION AND NO context HERE. The list carries the summary fields only;
  read either with "nexus ticket get <id>". --search matches the description
  too, so a row can look like an arbitrary hit — the text that matched it is not
  in this output. "ticket get" is where you see why.

  LABELS FEEDS BACK AS-IS. The label a ticket was typed with is surfaced as
  TYPE and left out of LABELS, so the list goes straight into --labels on
  update without editing. Every name in it already exists, which is what
  --labels requires.

  TYPE IS OFTEN EMPTY, AND THAT IS NOT A DATA FAULT. A ticket filed outside this
  CLI carries its type as an ordinary label and never gets the typed field set,
  so filtering or grouping on TYPE silently omits those rows. Filter on the
  label when you need every ticket of a kind.

  Paginated: --limit / --page, and the total is in the meta line (in --json,
  meta.total). --search is a substring over title and description.`;

/**
 * `nexus ticket list`
 *
 * Bound to `TicketList`. `--all-orgs` routes the SAME leaf to
 * `TicketListAcrossOrganizations`, whose params are the same two enums plus the
 * same free-string status — one command, two descriptors, and `bindCommand`
 * takes one shape. Binding the org-scoped one is the honest choice: it is the
 * default branch, and the values are identical, so the printed contract block
 * is true of both. `TicketListAcrossOrganizations` is therefore not in the
 * ledger and its own enums are not separately gated.
 */
export function registerTicketListCommand(ticket: Command, program: Command): Command {
  const leaf = addPaginationOptions(
    ticket
      .command("list")
      .description("List tickets")
      .addOption(enumOption("--type <type>", "Filter by type", TICKET_LIST__PARAMS_TYPE))
      .addOption(
        enumOption("--priority <priority>", "Filter by priority", TICKET_LIST__PARAMS_PRIORITY)
      )
      .option(
        "--status <status>",
        "Filter by workflow-state name — comma-separate for several. See Notes for how to read the set your team defines"
      )
      .option("--search <query>", "Search by title or description")
      .option(
        "--all-orgs",
        "List across EVERY organization you belong to, not just the active one. " +
          "Requires a personal (cross-org) token; adds an ORG column."
      )
      .addHelpText("after", LIST_HELP)
  );

  leaf.action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const params = {
        ...getPaginationParams(opts),
        type: opts.type,
        priority: opts.priority,
        status: opts.status,
        search: opts.search
      };

      if (opts.allOrgs) {
        await listAcrossOrganizations(client, params);
        return;
      }

      const { data, meta } = await client.tickets.list(params);
      printList(data, meta, TICKET_COLUMNS);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  bindCommand(leaf, TICKET_LIST_CONTRACT);
  return leaf;
}
