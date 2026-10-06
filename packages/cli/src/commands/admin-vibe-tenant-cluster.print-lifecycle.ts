/**
 * The PROVISION and DISABLE outcome printers for `nexus admin vibe-tenant-cluster provision | disable`.
 *
 * Each forwards the raw `data` dict to `printRecord`, which dumps it verbatim
 * under `--json` — so the wire contract (the discriminated outcome) reaches
 * stdout unchanged for `jq` consumers — and formats the labelled fields per
 * variant in a terminal. A kind this binary does not list prints as the
 * server's word and exits `unmeasured`, never `success`: this is a mutation, and
 * an outcome nobody can read is not evidence that it happened. On the listed
 * half the exhaustive `never` default pins each formatter to the schema.
 */

import {
  DISABLE_OUTCOME_KINDS,
  PROVISION_OUTCOME_KINDS,
  type VibeTenantClusterDisableOutcomeRead,
  type VibeTenantClusterProvisionOutcomeRead
} from "../admin-vibe-tenant-cluster-wire-types";
import { color, printRecord } from "../output";
import { isListedVariant } from "../vibe-unlisted-variant";
import { printUnlistedOutcome } from "./print-unlisted-outcome";

export function printProvisionOutcome(data: VibeTenantClusterProvisionOutcomeRead): void {
  if (!isListedVariant("kind", PROVISION_OUTCOME_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  const raw: Record<string, unknown> = data;
  switch (data.kind) {
    case "provisioning": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.green("provisioning") },
        {
          key: "reprovisioned",
          label: "Reprovisioned",
          format: (v) => (v ? "yes (re-opted-in from a retired cluster)" : "no")
        }
      ]);
      return;
    }
    case "already_active": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.dim("already_active (no-op)") },
        { key: "status", label: "Status" }
      ]);
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled provision outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function printDisableOutcome(data: VibeTenantClusterDisableOutcomeRead): void {
  if (!isListedVariant("kind", DISABLE_OUTCOME_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  const raw: Record<string, unknown> = data;
  switch (data.kind) {
    case "retained": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.green("retained (DISABLED_RETAINED)")
        },
        { key: "retainUntil", label: "Reaper eligible" }
      ]);
      return;
    }
    case "already_retained": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.dim("already_retained (no-op)") }
      ]);
      return;
    }
    case "not_found": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.yellow("not_found (org has no dedicated cluster)")
        }
      ]);
      return;
    }
    case "not_disablable": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.red("not_disablable") },
        { key: "status", label: "Status" }
      ]);
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled disable outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
