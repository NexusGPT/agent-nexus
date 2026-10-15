/**
 * `nexus admin vibe-rollback-sweep trigger` — fire the cost-safety rollback
 * sweep now.
 *
 * The sweep runs every 5 minutes in normal operation. QA often needs the loop
 * to close NOW — after suspending an org, so the rollback audit row can be seen
 * to land. This hits the generic cron manual-trigger endpoint with the pinned
 * CronKey below.
 */

import type { Command } from "commander";

import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printTriggerResult, type TriggerCronJobResponse } from "./_shared/print-trigger-result";

const VIBE_ROLLBACK_SWEEP_CRON_KEY = "VIBE_COST_SAFETY_ROLLBACK_SWEEP";

const HELP = `
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
`;

/** Registers the one verb on this sweep's command group. */
export function registerVibeRollbackSweepTriggerCommand(
  sweep: Command,
  admin: Command,
  program: Command
): void {
  sweep
    .command("trigger")
    .description("Fire VIBE_COST_SAFETY_ROLLBACK_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText("after", HELP)
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
