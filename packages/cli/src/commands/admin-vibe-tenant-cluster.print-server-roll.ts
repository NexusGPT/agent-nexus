/**
 * The REQUEST-SERVER-ROLL outcome printer for `nexus admin vibe-tenant-cluster
 * request-server-roll`.
 *
 * Forwards the raw `data` to `printRecord`, which dumps it verbatim under
 * `--json` and formats the labelled fields per variant in a terminal. A kind
 * this binary does not list prints as the server's word and exits `unmeasured`,
 * never `success`: this is a mutation, and an outcome nobody can read is not
 * evidence that it happened. On the listed half the exhaustive `never` default
 * pins the formatter to the schema.
 */

import {
  REQUEST_SERVER_ROLL_OUTCOME_KINDS,
  type VibeTenantClusterRequestServerRollOutcomeRead
} from "../admin-vibe-tenant-cluster-server-roll-wire-types";
import { color, printRecord } from "../output";
import { isListedVariant } from "../vibe-unlisted-variant";
import { printUnlistedOutcome } from "./print-unlisted-outcome";

const orDash = (v: unknown): string => (v == null ? color.dim("—") : String(v));

export function printRequestServerRollOutcome(
  data: VibeTenantClusterRequestServerRollOutcomeRead
): void {
  if (!isListedVariant("kind", REQUEST_SERVER_ROLL_OUTCOME_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  const raw: Record<string, unknown> = data;
  switch (data.kind) {
    case "requested": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.green("requested (HEALTHY → DEGRADED, converges on the next tick)")
        },
        { key: "requestedAt", label: "Generation" },
        { key: "reason", label: "Recorded reason" }
      ]);
      return;
    }
    case "already_pending": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.dim("already_pending (no-op — the last request has not settled)")
        },
        { key: "requestedAt", label: "Pending generation" },
        { key: "reason", label: "Its reason", format: orDash }
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
        { key: "pausedReason", label: "Paused because", format: orDash }
      ]);
      return;
    }
    case "not_settled": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () =>
            color.yellow("not_settled (refused — ask again once the cluster is HEALTHY)")
        },
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
      throw new Error(`Unhandled request-server-roll outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
