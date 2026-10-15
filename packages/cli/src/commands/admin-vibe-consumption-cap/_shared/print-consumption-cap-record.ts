/**
 * The consumption-cap view, shared by `get` and `set`.
 *
 * Every column is printed TWICE — the raw override beside the resolved
 * effective value — and that pairing is the whole point of the view: it is what
 * lets an operator tell "an explicit cap that happens to equal the default"
 * apart from "no override at all".
 *
 * 🔴 `backupMinCap` HAS NO `--backup` FLAG ON `set`. The record prints four
 * override/effective pairs and `set` accepts three (`--compute`, `--build`,
 * `--egress`), so the backup override is READ-ONLY from this CLI. That is the
 * shipped surface and is left exactly as it stands here; it is recorded because
 * reading the two files side by side is the only way to notice it.
 */

import type { VibeOrgConsumptionCapResponse } from "../../../admin-vibe-cost-safety-wire-types";
import { printRecord } from "../../../output";

export function printConsumptionCapRecord(data: VibeOrgConsumptionCapResponse): void {
  printRecord(data, [
    { key: "organizationId", label: "Organization" },
    {
      key: "present",
      label: "Row present",
      format: (v) => (v ? "yes" : "no (using platform defaults)")
    },
    {
      key: "computeMinCap",
      label: "Compute override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveComputeMinCap", label: "Compute effective", format: (v) => String(v) },
    {
      key: "buildMinCap",
      label: "Build override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveBuildMinCap", label: "Build effective", format: (v) => String(v) },
    {
      key: "egressMbCap",
      label: "Egress override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveEgressMbCap", label: "Egress effective", format: (v) => String(v) },
    {
      key: "backupMinCap",
      label: "Backup override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveBackupMinCap", label: "Backup effective", format: (v) => String(v) },
    { key: "createdAt", label: "Created", format: (v) => (v == null ? "—" : String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => (v == null ? "—" : String(v)) }
  ]);
}
