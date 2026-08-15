/**
 * `nexus admin vibe-rollback-sweep|vibe-build-job-timeout-sweep …` — the manual
 * cron triggers.
 *
 * Two command groups share this module rather than one each, because they share
 * their whole surface: one `trigger` verb apiece, the same generic endpoint
 * (POST /api/admin/health/cron-jobs/:jobName/trigger) with a different pinned
 * CronKey, the same response shape, and one printer. Split apart, each half
 * would be a ~55-line file that cannot be read without the other, plus a third
 * file holding the 20 lines they both need.
 *
 * Both crons run every 5 minutes in normal operation. These exist because QA
 * needs the loop to close NOW — after suspending an org, or when a build job is
 * wedged in RUNNING because its executor webhook never fired.
 */

import { Command } from "commander";

import { printRecord } from "../output";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

/**
 * Manual-trigger response shape. Mirrors `ZAdminHealth.TriggerCronJob.Response`
 * — message is always present, executionId + metadata are optional. The
 * actual metadata for the rollback sweep is `{ candidates, rolledBack,
 * auditEventCount }` per the cron handler; the value-type is `unknown`
 * because the trigger endpoint is generic over all crons.
 */
interface TriggerCronJobResponse {
  message: string;
  executionId?: string;
  metadata?: Record<string, unknown>;
}

const VIBE_ROLLBACK_SWEEP_CRON_KEY = "VIBE_COST_SAFETY_ROLLBACK_SWEEP";

export function registerVibeRollbackSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-rollback-sweep")
    .description("Operate the Vibe cost-safety rollback sweep cron");

  sweep
    .command("trigger")
    .description("Fire VIBE_COST_SAFETY_ROLLBACK_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-rollback-sweep trigger
  $ nexus admin vibe-rollback-sweep trigger --json

Notes:
  The rollback sweep runs every 5 minutes under normal operation. QA
  often needs the loop to close FASTER — e.g. "I just SUSPENDED an org
  via vibe-cost-safety set, sweep right now so I can see the rollback
  audit row land." This command hits the generic cron manual-trigger
  endpoint (POST /api/admin/health/cron-jobs/:jobName/trigger) with the
  pinned CronKey VIBE_COST_SAFETY_ROLLBACK_SWEEP.

  The execution log fields surface what happened — candidates =
  active deployments across all SUSPENDED orgs; rolledBack = how many
  actually flipped (a SMALLER number means a status-guarded UPDATE
  race-lost mid-sweep, which is expected and benign); auditEventCount
  matches rolledBack 1-to-1 because audit rows live INSIDE the per-row
  TX.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<TriggerCronJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/health/cron-jobs/${VIBE_ROLLBACK_SWEEP_CRON_KEY}/trigger`
        });
        printTriggerResult(data, [
          { key: "candidates", label: "Candidates", format: (v) => (v == null ? "—" : String(v)) },
          { key: "rolledBack", label: "Rolled back", format: (v) => (v == null ? "—" : String(v)) },
          {
            key: "auditEventCount",
            label: "Audit events",
            format: (v) => (v == null ? "—" : String(v))
          }
        ]);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-build-job-timeout-sweep
// ============================================================

const VIBE_BUILD_JOB_TIMEOUT_SWEEP_CRON_KEY = "VIBE_BUILD_JOB_TIMEOUT_SWEEP";

export function registerVibeBuildJobTimeoutSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-build-job-timeout-sweep")
    .description("Operate the Vibe build-job timeout sweep cron");

  sweep
    .command("trigger")
    .description("Fire VIBE_BUILD_JOB_TIMEOUT_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText(
      "after",
      `
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
`
    )
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

/**
 * Render a generic cron manual-trigger response. The wire shape is the
 * same for every cron (message + executionId + a per-cron `metadata`
 * bag); each caller supplies the `metadataFields` that flatten its own
 * metadata keys into readable rows. JSON mode falls through to the
 * dict-as-is so jq consumers still get the nested `metadata` envelope.
 */
function printTriggerResult(
  data: TriggerCronJobResponse,
  metadataFields: { key: string; label: string; format?: (val: unknown) => string }[]
): void {
  const flat: Record<string, unknown> = {
    message: data.message,
    executionId: data.executionId ?? null,
    ...(data.metadata ?? {})
  };
  printRecord(flat, [
    { key: "message", label: "Result" },
    { key: "executionId", label: "Execution id", format: (v) => (v == null ? "—" : String(v)) },
    ...metadataFields
  ]);
}
