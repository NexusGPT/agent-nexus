/**
 * Prints one deployment-runner tick outcome for `nexus admin vibe-deployment-runner tick`.
 *
 * A kind this binary does not list prints as the server's word and exits
 * `unmeasured`; on the listed half, the `never` fallthrough pins the printer to
 * the schema, so a newly listed kind lands as a TypeScript error here.
 */

import {
  type AdminVibeDeploymentRunnerTickReadResponse,
  DEPLOYMENT_RUNNER_TICK_KINDS
} from "../admin-vibe-runner-tick-kinds";
import { color, printRecord } from "../output";
import { isListedVariant } from "../vibe-unlisted-variant";
import { printUnlistedOutcome } from "./print-unlisted-outcome";

export function printDeploymentTickRecord(data: AdminVibeDeploymentRunnerTickReadResponse): void {
  if (!isListedVariant("kind", DEPLOYMENT_RUNNER_TICK_KINDS, data)) {
    printUnlistedOutcome("kind", data);
    return;
  }
  switch (data.kind) {
    case "idle": {
      printRecord({ outcome: color.dim("idle (no DEPLOYING+imageRef rows)") }, [
        { key: "outcome", label: "Outcome" }
      ]);
      return;
    }
    case "dispatched": {
      printRecord({ outcome: color.green("dispatched"), deploymentId: data.deploymentId }, [
        { key: "outcome", label: "Outcome" },
        { key: "deploymentId", label: "Deployment" }
      ]);
      return;
    }
    case "dispatch_failed_compensated": {
      printRecord(
        {
          outcome: color.red("dispatch_failed_compensated"),
          deploymentId: data.deploymentId,
          retryable: data.retryable ? "yes (transient)" : "no (permanent)",
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "deploymentId", label: "Deployment" },
          { key: "retryable", label: "Retryable" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    case "timed_out": {
      printRecord(
        {
          outcome: color.red("timed_out (reaped to FAILED)"),
          deploymentId: data.deploymentId,
          age: `${Math.round(data.ageMs / 60_000)}min stuck in DEPLOYING`
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "deploymentId", label: "Deployment" },
          { key: "age", label: "Stuck for" }
        ]
      );
      return;
    }
    case "displaced": {
      printRecord(
        {
          outcome: color.yellow("displaced (a newer deployment owns the rollout)"),
          deploymentId: data.deploymentId,
          displacedBy: data.displacedByDeploymentId
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "deploymentId", label: "Deployment" },
          { key: "displacedBy", label: "Displaced by" }
        ]
      );
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled deployment tick outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
