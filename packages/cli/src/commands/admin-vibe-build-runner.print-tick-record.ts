/**
 * Prints one build-runner tick outcome for `nexus admin vibe-build-runner tick`.
 *
 * The `never` fallthrough is what pins it to the schema: a new tick outcome
 * variant lands as a TypeScript error here rather than a silent default.
 */

import { type AdminVibeBuildRunnerTickResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";

export function printTickRecord(data: AdminVibeBuildRunnerTickResponse): void {
  // The discriminated union narrows to flat fields per variant. The
  // never-fallthrough check pins the formatter to the schema — any
  // future variant lands as a TS error here, not a silent default.
  switch (data.kind) {
    case "idle": {
      printRecord({ outcome: color.dim("idle (no PENDING jobs)") }, [
        { key: "outcome", label: "Outcome" }
      ]);
      return;
    }
    case "dispatched": {
      printRecord({ outcome: color.green("dispatched"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "race_lost": {
      printRecord({ outcome: color.yellow("race_lost"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "org_at_capacity": {
      printRecord(
        {
          outcome: color.yellow("org_at_capacity"),
          buildJobId: data.buildJobId,
          organizationId: data.organizationId,
          inFlight: `${data.inFlight} (cap ${data.cap})`
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "buildJobId", label: "Build job" },
          { key: "organizationId", label: "Organization" },
          { key: "inFlight", label: "Builds in flight" }
        ]
      );
      return;
    }
    case "dispatch_failed_requeued": {
      printRecord(
        {
          outcome: color.yellow("dispatch_failed_requeued"),
          buildJobId: data.buildJobId,
          attempt: String(data.attempt),
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "buildJobId", label: "Build job" },
          { key: "attempt", label: "Queued again as attempt" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    case "dispatch_failed_compensated": {
      printRecord(
        {
          outcome: color.red("dispatch_failed_compensated"),
          buildJobId: data.buildJobId,
          retryable: data.retryable ? "yes (transient)" : "no (permanent)",
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "buildJobId", label: "Build job" },
          { key: "retryable", label: "Retryable" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled tick outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
