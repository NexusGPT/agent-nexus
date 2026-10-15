/**
 * The fleet-read renderer for `nexus admin vibe-cost-safety list`.
 *
 * Beside `list.command.ts` rather than in `_shared/` because only that one verb
 * reaches it — a printer in `_shared/` claims a sharing that does not exist.
 */

import type { ListVibeOrgCostSafetyStatesResponse } from "../../admin-vibe-cost-safety-wire-types";
import { color, isJsonMode, printTable } from "../../output";

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
export function printCostSafetyList(
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
