/**
 * `nexus admin vibe-build-runner …` — one tick of the build-runner pipeline.
 *
 * The production driver is a cron on a sub-second cadence across all tenants.
 * This command fires one tick by hand, for QA and incident response, and prints
 * the structured outcome so the operator can repeat until the queue drains.
 *
 * The printer lives beside it in `admin-vibe-build-runner.print-tick-record.ts`.
 */

import { Command } from "commander";

import { type AdminVibeBuildRunnerTickResponse } from "../admin-wire-types";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";
import { printTickRecord } from "./admin-vibe-build-runner.print-tick-record";

export function registerVibeBuildRunnerCommands(admin: Command, program: Command): void {
  const runner = admin
    .command("vibe-build-runner")
    .description("Operate the Vibe build-runner pipeline (manual tick)");

  runner
    .command("tick")
    .description(
      "Fire one tick: find the next queued build → admit it → dispatch → on failure compensate to FAILED"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-runner tick
  $ nexus admin vibe-build-runner tick --json

Notes:
  The build-runner cron is the production driver — sub-second cadence
  across all tenants. This admin command exists for QA + incident
  response: fire a tick now, see the structured outcome, repeat.

Outcome shapes:
  idle                              No queued build whose parent
                                    deployment is still BUILDING, in
                                    an organization under its cap.
  dispatched                        A job was claimed AND handed off
                                    to the executor.
  race_lost                         Another runner claimed the job
                                    between find and our status-
                                    guarded UPDATE.
  org_at_capacity                   The job's organization already has
                                    as many builds in flight as its
                                    concurrency cap allows. The job
                                    stays queued and is admitted once
                                    the organization is under the cap.
  dispatch_failed_requeued          The executor refused the job with a
                                    retryable error. The job took its one
                                    automatic retry and is queued again
                                    on the attempt shown.
  dispatch_failed_compensated       The executor refused the job; we
                                    flipped ADMITTED → FAILED — a refusal
                                    it did not mark retryable, or one on
                                    the job's last attempt.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeBuildRunnerTickResponse>(opts, {
          method: "POST",
          path: "/api/admin/vibe/build-runner/tick",
          body: {}
        });
        printTickRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
