/**
 * `nexus admin vibe-deployment-runner …` — one tick of the deployer pipeline.
 *
 * Symmetric to vibe-build-runner, with one behavioural difference worth knowing
 * before firing it repeatedly: there is no claim step. The row stays DEPLOYING
 * from markBuildSucceeded until the executor webhook flips it, so repeated
 * ticks can re-pick the same row. The dispatch port is idempotent (the Nomad
 * service name is deterministic), which makes a re-dispatch a no-op downstream.
 */

import { Command } from "commander";

import { type AdminVibeDeploymentRunnerTickResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

export function registerVibeDeploymentRunnerCommands(admin: Command, program: Command): void {
  const runner = admin
    .command("vibe-deployment-runner")
    .description("Operate the Vibe deployer pipeline (manual tick)");

  runner
    .command("tick")
    .description(
      "Fire one tick: find next DEPLOYING+imageRef → dispatch → on failure compensate to FAILED"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment-runner tick
  $ nexus admin vibe-deployment-runner tick --json

Why this exists:
  The deployer cron is the production driver — picks up DEPLOYING
  rows whose build runner has stamped imageRef, hands them off to
  the Nomad service + ALB target-group flip. This admin command
  exists for QA + incident response: fire a tick now, see the
  structured outcome, repeat.

Outcome shapes:
  idle                              No DEPLOYING+imageRef rows.
  dispatched                        A deployment was handed off to
                                    the executor.
  dispatch_failed_compensated       The executor refused the deploy;
                                    we flipped DEPLOYING → FAILED.
                                    'retryable' is informational
                                    (user re-triggers either way
                                    for v1).
  timed_out                         The deploy sat in DEPLOYING past
                                    the health budget (executor webhook
                                    never reported); reaped to FAILED
                                    instead of re-dispatching forever.

Re-dispatch behavior:
  Unlike the build-runner, there is no claim step. The row stays
  DEPLOYING from markBuildSucceeded until the executor webhook
  flips it. Repeated ticks may re-pick the same row; the dispatch
  port is idempotent (deterministic Nomad service name) so
  re-dispatch is a no-op at the executor.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentRunnerTickResponse>(opts, {
          method: "POST",
          path: "/api/admin/vibe/deployment-runner/tick",
          body: {}
        });
        printDeploymentTickRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

function printDeploymentTickRecord(data: AdminVibeDeploymentRunnerTickResponse): void {
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
