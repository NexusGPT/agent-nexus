/**
 * `nexus admin vibe-cost-safety …` — the Vibe cost-safety gate.
 *
 * Three verbs over one resource: `list` reads the gated fleet, `get` and `set`
 * read and flip one org's state. `set` is the operator escape hatch that
 * SUSPENDED orgs are refused new deploys by.
 *
 * The flag parsers below all refuse locally, before the HTTP call, and exit 5 —
 * mirroring the backend's 422 rather than spending a round trip to be told the
 * same thing.
 */

import { Command } from "commander";

import {
  COST_SAFETY_STATUS_VALUES,
  type CostSafetyStatus,
  type ListVibeOrgCostSafetyStatesResponse,
  type VibeOrgCostSafetyStateResponse
} from "../admin-wire-types";
import { color, isJsonMode, printRecord, printTable } from "../output";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

/** Narrow an operator-typed string onto the wire enum. */
function isCostSafetyStatus(v: string): v is CostSafetyStatus {
  return (COST_SAFETY_STATUS_VALUES as readonly string[]).includes(v);
}

/** Validate a status the operator typed. Refuses before the HTTP call (exit 5). */
function parseStatus(raw: string): CostSafetyStatus {
  const status = raw.toUpperCase();
  if (!isCostSafetyStatus(status)) {
    throw AdminCliError.localValidation(
      `Invalid --status "${raw}". Allowed: ${COST_SAFETY_STATUS_VALUES.join(", ")}.`
    );
  }
  return status;
}

/** Same, for a filter flag where absence means "every status", not "none". */
function parseOptionalStatus(raw: string | undefined): CostSafetyStatus | undefined {
  return raw === undefined ? undefined : parseStatus(raw);
}

/**
 * Parse a paging flag, or return `undefined` when the operator omitted it.
 *
 * `undefined` is dropped from the query string by `adminRequest`, so the
 * SERVER's default applies. Re-declaring a default here would fork it the day
 * the server's default changes, and the CLI would then page differently from
 * the endpoint it is a window onto.
 *
 * The digits-only test is deliberate: `Number()` alone accepts `0x10`, `1e3`
 * and `+5`, all of which would reach the server as a value the operator did
 * not type.
 */
function parsePagingFlag(
  flag: string,
  raw: string | undefined,
  min: number,
  max?: number
): number | undefined {
  if (raw === undefined) return undefined;
  const bounds = max === undefined ? `>= ${min}` : `in [${min}, ${max}]`;
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (
    !/^\d+$/.test(trimmed) ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    throw AdminCliError.localValidation(`Invalid ${flag} "${raw}". Expected an integer ${bounds}.`);
  }
  return parsed;
}

export function registerVibeCostSafetyCommands(admin: Command, program: Command): void {
  const cs = admin
    .command("vibe-cost-safety")
    .description("List the gated fleet, or inspect / flip one org's Vibe cost-safety state");

  cs.command("list")
    .description("List every org that has a cost-safety row, most-recently-changed first")
    .option("--status <status>", "Filter to OK | WARNING | SUSPENDED. Omit for every row.")
    .option("--limit <n>", "Page size, 1-200. Omit to take the server's default.")
    .option("--offset <n>", "Rows to skip. Omit for the first page.")
    .addHelpText(
      "after",
      `
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
`
    )
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

  cs.command("get")
    .description("Read one org's cost-safety state (defaults to OK when no row exists)")
    .argument("<organizationId>", "Target organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-cost-safety get org_abc123
  $ nexus admin vibe-cost-safety get org_abc123 --json

Notes:
  status            OK | WARNING | SUSPENDED. SUSPENDED refuses new deploys.
  suspendedReason   Carried verbatim into the refuse-deploy HTTP message.
  present           false = no row exists (treated as OK at the deploy gate).
                    true  = a row exists, even if it's been explicitly set back to OK.
`
    )
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  cs.command("set")
    .description("Flip one org's cost-safety state (operator escape hatch)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption("--status <status>", "OK | WARNING | SUSPENDED")
    .option(
      "--reason <text>",
      "Required when --status SUSPENDED. 1-500 chars. Carried verbatim into the refuse-deploy HTTP message for the gated org."
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-cost-safety set org_abc --status SUSPENDED --reason "fraud investigation"
  $ nexus admin vibe-cost-safety set org_abc --status OK
  $ nexus admin vibe-cost-safety set org_abc --status WARNING

Notes:
  --reason is required when --status SUSPENDED (refused locally before the
  HTTP call, mirroring the backend's 422). For non-SUSPENDED statuses any
  reason passed is dropped — the use case normalizes the column to null
  so flipping back to OK never carries a stale rationale forward.
`
    )
    .action(async (organizationId: string, cmdOpts: { status: string; reason?: string }) => {
      try {
        const status = parseStatus(cmdOpts.status);
        const trimmedReason = cmdOpts.reason?.trim();
        if (status === "SUSPENDED" && !trimmedReason) {
          throw AdminCliError.localValidation(
            "--reason is required (non-empty) when --status SUSPENDED."
          );
        }

        // Body only carries the reason when SUSPENDED. The backend normalizes
        // non-SUSPENDED requests to null anyway, but sending a stale reason
        // would still surface in the audit trail's request payload — keep it
        // out so the audit row only carries the rationale that the gate
        // actually uses.
        const body: { status: CostSafetyStatus; suspendedReason?: string } = { status };
        if (status === "SUSPENDED" && trimmedReason) {
          body.suspendedReason = trimmedReason;
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "PATCH",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`,
          body
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

function printCostSafetyRecord(data: VibeOrgCostSafetyStateResponse): void {
  // printRecord forwards the data dict verbatim when --json is set, so the
  // wire contract reaches stdout unchanged for `jq` consumers. In TTY mode
  // it formats the labelled fields below.
  printRecord(data, [
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatStatus },
    {
      key: "suspendedReason",
      label: "Suspended reason",
      format: (v) => (v == null ? "—" : String(v))
    },
    { key: "present", label: "Row present", format: (v) => (v ? "yes" : "no (defaulting to OK)") },
    { key: "createdAt", label: "Created", format: (v) => (v == null ? "—" : String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => (v == null ? "—" : String(v)) }
  ]);
}

/**
 * Render the fleet read.
 *
 * The rows are printed in the order the server sent them and are never
 * re-sorted: the endpoint orders by `updatedAt` desc THEN `organizationId`
 * desc, and the second key is what keeps an offset page boundary from
 * skipping or duplicating an org when timestamps collide — which they do, to
 * the millisecond, in this table. Re-sorting on the client would silently
 * undo that.
 *
 * `--json` forwards the wire envelope verbatim (`{items,total}`) rather than
 * reshaping it, so a `jq` consumer pages against exactly what the API
 * returned. The table drops `createdAt`: an operator scanning for a gate
 * outage wants the change that caused it, and `--json` still carries both.
 *
 * Status is NOT colourised in the table, unlike the single-record view.
 * `printTable` measures column width with `String.length` and pads/slices on
 * it, so an ANSI escape both inflates the width and can be cut mid-sequence —
 * colour here would misalign every column to its right, per row.
 */
function printCostSafetyList(
  data: ListVibeOrgCostSafetyStatesResponse,
  offset: number | undefined
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  printTable(data.items, [
    { key: "organizationId", label: "Organization" },
    { key: "organizationName", label: "Name", format: (v) => (v == null ? "—" : String(v)) },
    { key: "status", label: "Status" },
    {
      key: "suspendedReason",
      label: "Suspended reason",
      format: (v) => (v == null ? "—" : String(v))
    },
    { key: "updatedAt", label: "Updated" }
  ]);

  const start = offset ?? 0;
  const parts = [`${data.items.length} shown`, `${data.total} total`];
  if (start + data.items.length < data.total) {
    parts.push(`next page: --offset ${start + data.items.length}`);
  }
  console.log(color.dim(`\n${parts.join(" · ")}`));
}

function formatStatus(v: unknown): string {
  const status = String(v);
  if (status === "SUSPENDED") return color.red(status);
  if (status === "WARNING") return color.yellow(status);
  if (status === "OK") return color.green(status);
  return status;
}
