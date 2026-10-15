/**
 * The single-record cost-safety view, shared by `get` and `set`.
 *
 * It colourises `status`; the LIST view deliberately does not, and the reason
 * is in `list.print.ts` rather than here — it is a property of `printTable`,
 * not of this formatter.
 */

import type { VibeOrgCostSafetyStateResponse } from "../../../admin-vibe-cost-safety-wire-types";
import { color, printRecord } from "../../../output";

export function printCostSafetyRecord(data: VibeOrgCostSafetyStateResponse): void {
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

function formatStatus(v: unknown): string {
  const status = String(v);
  if (status === "SUSPENDED") return color.red(status);
  if (status === "WARNING") return color.yellow(status);
  if (status === "OK") return color.green(status);
  return status;
}
