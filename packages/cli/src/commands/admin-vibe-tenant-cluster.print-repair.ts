/**
 * The FORCE-CONVERGE and COMPLETE-TEARDOWN outcome printers for `nexus admin vibe-tenant-cluster force-converge | complete-teardown`.
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
  COMPLETE_TEARDOWN_OUTCOME_KINDS,
  FORCE_CONVERGE_OUTCOME_KINDS,
  type VibeTenantClusterCompleteTeardownOutcomeRead,
  type VibeTenantClusterForceConvergeOutcomeRead
} from "../admin-vibe-tenant-cluster-wire-types";
import { color, printRecord } from "../output";
import { isListedVariant } from "../vibe-unlisted-variant";
import { printUnlistedOutcome } from "./print-unlisted-outcome";

export function printForceConvergeOutcome(data: VibeTenantClusterForceConvergeOutcomeRead): void {
  if (!isListedVariant("kind", FORCE_CONVERGE_OUTCOME_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  const raw: Record<string, unknown> = data;
  switch (data.kind) {
    case "forced": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.green("forced (HEALTHY → DEGRADED)") },
        { key: "reason", label: "Recorded reason" }
      ]);
      return;
    }
    case "already_converging": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () =>
            color.dim("already_converging (no-op — the reconcile loop already retries this)")
        },
        { key: "status", label: "Status" }
      ]);
      return;
    }
    case "reconcile_paused": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.yellow("reconcile_paused (refused — release the pause first)")
        },
        { key: "status", label: "Status" },
        {
          key: "pausedReason",
          label: "Paused because",
          format: (v) => (v == null ? color.dim("—") : String(v))
        }
      ]);
      return;
    }
    case "not_converging": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.red("not_converging (refused)") },
        { key: "status", label: "Status" }
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
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled force-converge outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function printCompleteTeardownOutcome(
  data: VibeTenantClusterCompleteTeardownOutcomeRead
): void {
  if (!isListedVariant("kind", COMPLETE_TEARDOWN_OUTCOME_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  const raw: Record<string, unknown> = data;
  switch (data.kind) {
    case "destroyed": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.green("destroyed (DESTROYING → DESTROYED)")
        },
        { key: "confirmation", label: "Recorded confirmation" }
      ]);
      return;
    }
    case "already_destroyed": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.dim("already_destroyed (no-op)") }
      ]);
      return;
    }
    case "not_destroying": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.red("not_destroying (refused)") },
        { key: "status", label: "Status" }
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
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled complete-teardown outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
