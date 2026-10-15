/**
 * `nexus admin vibe-build-job-timeout-sweep trigger` — reap a wedged build job
 * now.
 *
 * A build job whose executor webhook never fires sits RUNNING forever: the
 * build-runner tick only finds PENDING jobs, so it never re-encounters a
 * RUNNING one. The sweep runs every 5 minutes; this fires it immediately with
 * the pinned CronKey below.
 */

import type { Command } from "commander";

import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printTriggerResult, type TriggerCronJobResponse } from "./_shared/print-trigger-result";

const VIBE_BUILD_JOB_TIMEOUT_SWEEP_CRON_KEY = "VIBE_BUILD_JOB_TIMEOUT_SWEEP";

const HELP = `
Examples:
  $ nexus admin vibe-build-job-timeout-sweep trigger
  $ nexus admin vibe-build-job-timeout-sweep trigger --json

Notes:
  The timeout sweep runs every 5 minutes under normal operation. A build
  job whose executor webhook never fires sits RUNNING forever (the
  build-runner tick only finds PENDING jobs, so it never re-encounters a
  RUNNING one). QA often needs to reap a stuck job NOW rather than wait
  for the next scheduled tick. This command hits the generic cron
  manual-trigger endpoint (POST /api/admin/health/cron-jobs/:jobName/
  trigger) with the pinned CronKey VIBE_BUILD_JOB_TIMEOUT_SWEEP.

  The execution-log metadata surfaces the outcome — kind is one of
  idle (no RUNNING jobs) / within_budget (oldest RUNNING not yet over the
  30-min budget) / timed_out (the FIFO-head job was reaped to TIMED_OUT
  with a BUILD_JOB_TIMED_OUT audit) / race_lost (the runner reported a
  terminal status between the read and the status-guarded write). The
  sweep reaps at most one job per tick (the most-stuck FIFO head); ageMs
  is its in-RUNNING age.
`;

/** Registers the one verb on this sweep's command group. */
export function registerVibeBuildJobTimeoutSweepTriggerCommand(
  sweep: Command,
  admin: Command,
  program: Command
): void {
  sweep
    .command("trigger")
    .description("Fire VIBE_BUILD_JOB_TIMEOUT_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText("after", HELP)
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<TriggerCronJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/health/cron-jobs/${VIBE_BUILD_JOB_TIMEOUT_SWEEP_CRON_KEY}/trigger`
        });
        printTriggerResult(data, [
          { key: "kind", label: "Outcome", format: (v) => (v == null ? "—" : String(v)) },
          { key: "buildJobId", label: "Build job", format: (v) => (v == null ? "—" : String(v)) },
          {
            key: "ageMs",
            label: "In-RUNNING age",
            format: (v) => (typeof v === "number" ? `${Math.round(v / 60_000)}min` : "—")
          }
        ]);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
