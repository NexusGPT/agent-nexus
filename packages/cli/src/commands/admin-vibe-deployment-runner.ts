/**
 * `nexus admin vibe-deployment-runner …` — one tick of the deployer pipeline.
 *
 * Symmetric to vibe-build-runner, with one behavioural difference worth knowing
 * before firing it repeatedly: there is no claim step. The row stays DEPLOYING
 * from markBuildSucceeded until the executor webhook flips it, so repeated
 * ticks can re-pick the same row. The dispatch port is idempotent (the Nomad
 * service name is deterministic), which makes a re-dispatch a no-op downstream.
 *
 * The printer lives beside it in `admin-vibe-deployment-runner.print-tick-record.ts`.
 */

import { Command } from "commander";

import { type AdminVibeDeploymentRunnerTickReadResponse } from "../admin-vibe-runner-tick-kinds";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";
import { printDeploymentTickRecord } from "./admin-vibe-deployment-runner.print-tick-record";

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

Notes:
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
        const data = await adminRequest<AdminVibeDeploymentRunnerTickReadResponse>(opts, {
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
