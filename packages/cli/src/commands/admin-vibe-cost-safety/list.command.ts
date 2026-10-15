/**
 * `nexus admin vibe-cost-safety list` — the gated fleet, most-recently-changed
 * first.
 *
 * The `--help` prose is a module-level const rather than an inline literal, so
 * the registrar below reads as wiring and the prose is editable without
 * scrolling past a command tree. That is this package's own pattern.
 */

import type { Command } from "commander";

import type { ListVibeOrgCostSafetyStatesResponse } from "../../admin-vibe-cost-safety-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { parsePagingFlag } from "./_shared/parse-paging-flag";
import { parseOptionalStatus } from "./_shared/parse-status";
import { printCostSafetyList } from "./list.print";

const HELP = `
Examples:
  Which orgs are gated right now — the incident query:
    $ nexus admin vibe-cost-safety list --status SUSPENDED

  The whole gate population:
    $ nexus admin vibe-cost-safety list

  Page through a large fleet:
    $ nexus admin vibe-cost-safety list --limit 50 --offset 50

  Feed a script:
    $ nexus admin vibe-cost-safety list --status SUSPENDED --json | jq '.items[].organizationId'

Output fields:
  Organization      The org id. Always present, even when the name is not.
  Name              Resolved for display. "—" means the org is gone but its
                    cost-safety row outlived it — the id is still the truth.
  Status            OK | WARNING | SUSPENDED. SUSPENDED refuses new deploys.
  Suspended reason  Carried verbatim into the refuse-deploy HTTP message.
                    Truncated in the table; --json carries it in full.
  Updated           When the row last changed. This is the sort key.

Notes:
  The table is empty only when no row matches — the table is sparse by
  construction, a row exists only once something has touched the org, so an
  unfiltered list IS the whole gate population rather than every org.

  Order is the server's and is never re-sorted here: updatedAt descending,
  then organizationId descending. That second key is load-bearing, not
  decoration — timestamps collide to the millisecond in this table, and a
  sort on updatedAt alone lets a page boundary skip or duplicate an org.
  Paging is exactly where that would bite, so the CLI pages against the
  order the server actually returned.

  The footer prints the --offset for the next page whenever one exists.
`;

/** Registers the verb on the `vibe-cost-safety` command group. */
export function registerVibeCostSafetyListCommand(
  cs: Command,
  admin: Command,
  program: Command
): void {
  cs.command("list")
    .description("List every org that has a cost-safety row, most-recently-changed first")
    .option("--status <status>", "Filter to OK | WARNING | SUSPENDED. Omit for every row.")
    .option("--limit <n>", "Page size, 1-200. Omit to take the server's default.")
    .option("--offset <n>", "Rows to skip. Omit for the first page.")
    .addHelpText("after", HELP)
    .action(async (cmdOpts: { status?: string; limit?: string; offset?: string }) => {
      try {
        const status = parseOptionalStatus(cmdOpts.status);
        const limit = parsePagingFlag("--limit", cmdOpts.limit, 1, 200);
        const offset = parsePagingFlag("--offset", cmdOpts.offset, 0);

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<ListVibeOrgCostSafetyStatesResponse>(opts, {
          method: "GET",
          path: "/api/admin/vibe/cost-safety",
          query: { status, limit, offset }
        });
        printCostSafetyList(data, offset);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
