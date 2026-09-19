import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { VIBE_AUDIT_EVENT_TYPES } from "../../../vibe-audit-event-types.generated";
import { isAuditEventType, type ListAuditEventsResponse } from "../../../vibe-wire-types";
import { formatEventTypeHelp } from "../_shared/format-event-type-help";
import { parseLimit } from "../_shared/parse-limit";
import { printAuditEvents } from "../_shared/print-audit-events";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

const AUDIT_LIST_HELP = `
Examples:
  $ nexus apps audit list
  $ nexus apps audit list --limit 20
  $ nexus apps audit list --type DEPLOYMENT_TRIGGERED --app 11111111-2222-4333-8444-555555555555
  $ nexus apps audit list --type DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK --app <appId>
  $ nexus apps audit list --cursor "2026-05-25T12:00:00.000Z|abc…"
  $ nexus apps audit list --json | jq '.events[]'

Event types (--type takes exactly one):
${formatEventTypeHelp()}
  A deploy watcher polls the terminal states: DEPLOYMENT_SERVED (live and
  serving), DEPLOYMENT_HEALTHY (allocation healthy, edge not yet swapped),
  DEPLOYMENT_FAILED, DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK, BUILD_JOB_FAILED.
  This list is generated from the schema, so it never lags the feed.

Output:
  Human mode prints a table with the most-load-bearing field per
  event type collapsed into the "details" column — sha+gated for
  triggers, decider+decisive for approvals, usageType+sum+cap+period
  for cost-safety suspensions, priorStatus+reason for rollbacks.

  --json mode passes the wire envelope through unchanged so jq
  consumers see the discriminated-union payload + nextCursor field
  as-is.

Pagination:
  When more pages exist, the bottom of the table surfaces the
  nextCursor verbatim — paste it back as --cursor for the next page.
  When nextCursor is null, you've reached the end of the visible
  window. Audit rows are append-only: re-running with no cursor
  always returns the newest first.

Notes:
  TWO MORE FAMILIES ARE WORTH A FILTER, AND NEITHER IS A DEPLOY EVENT.
  COST_SAFETY_AUTO_SUSPENDED IS NOT A WARNING. A sweep then flips EVERY
  non-terminal deployment in that org to ROLLED_BACK, one
  DEPLOYMENT_ROLLED_BACK_COST_SAFETY row per app — so the org stops serving
  shortly after this event, with no failing build and nothing in the deploy
  family to explain it. COST_SAFETY_SOFT_LIMIT_WARNING is the one that only
  warns.
  DEPLOYMENT_VERIFICATION_OVERRIDDEN IS THE ONLY RECORD THAT A SHIP GATE WAS
  BYPASSED. "apps deploy --skip-verification" names the caller and the commit
  here and nowhere else. Its neighbours: DEPLOYMENT_VERIFICATION_REFUSED (the
  gate stopped the deploy) and DEPLOYMENT_VERIFICATION_WARNED (the app sits in
  WARN, so the gate ran, recorded, and shipped anyway).
`;

/** `nexus apps audit list` */
export function registerAppsAuditListCommand(audit: Command, program: Command): Command {
  const leaf = audit
    .command("list")
    .description("List recent Vibe audit events, newest-first (cursor paginated)")
    .option(
      "--app <appId>",
      "Filter to a single VibeApp. Mismatched (app, org) returns an empty page — cross-tenant reads never leak existence."
    )
    .option(
      "--type <eventType>",
      `Filter to a single event type. ${VIBE_AUDIT_EVENT_TYPES.length} values — listed under "Event types" below.`
    )
    .option("--limit <n>", "Page size, 1-100. Default 50.", "50")
    .option("--cursor <opaque>", "Cursor from a prior page's `nextCursor`. First-page calls omit.")
    .addHelpText("after", AUDIT_LIST_HELP)
    .action(async (cmdOpts: { app?: string; type?: string; limit?: string; cursor?: string }) => {
      try {
        const limit = parseLimit(cmdOpts.limit);
        if (cmdOpts.type !== undefined && !isAuditEventType(cmdOpts.type)) {
          // The full list, not a pointer to --help. The whole defect this
          // guard once carried was an operator being told a real event type
          // did not exist; a refusal that does not name the alternatives
          // reproduces the same dead end one step later.
          throw new Error(
            `Invalid --type "${cmdOpts.type}". Allowed values:\n${formatEventTypeHelp()}`
          );
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListAuditEventsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/audit-events",
          query: {
            vibeAppId: cmdOpts.app,
            eventType: cmdOpts.type,
            cursor: cmdOpts.cursor,
            limit
          }
        });
        printAuditEvents(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
