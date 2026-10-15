/**
 * `nexus admin vibe-rollback-sweep|vibe-build-job-timeout-sweep …` — the manual
 * cron triggers.
 *
 * Two command groups share this module rather than one each, because they share
 * their whole surface: one `trigger` verb apiece, the same generic endpoint
 * (POST /api/admin/health/cron-jobs/:jobName/trigger) with a different pinned
 * CronKey, the same response shape, and one printer — which is why
 * `_shared/print-trigger-result.ts` holds the shape and the renderer together
 * rather than putting them beside either sweep.
 *
 * Both crons run every 5 minutes in normal operation. These exist because QA
 * needs the loop to close NOW — after suspending an org, or when a build job is
 * wedged in RUNNING because its executor webhook never fired.
 *
 * ⚠️ UNTIL THIS CHANGE, THIS FILE'S OWN HEADER ARGUED AGAINST SPLITTING IT:
 * "split apart, each half would be a ~55-line file that cannot be read without
 * the other, plus a third file holding the 20 lines they both need." That
 * argument is sound about READING and it is not what the split is for — the
 * caps are a regrowth gate, and the shared 20 lines now sit in `_shared/` where
 * the sharing is visible instead of implied by adjacency. The two groups still
 * belong together, and that is what this file being their single wiring point
 * says.
 *
 * 🚨 THIS FILE IS WIRING. ESLint caps it at 150 lines and every function at 80,
 * so a verb that grows in place is a lint error rather than a review judgement.
 */

import { Command } from "commander";

import { registerVibeBuildJobTimeoutSweepTriggerCommand } from "./admin-vibe-cron-sweeps/build-job-timeout-sweep-trigger.command";
import { registerVibeRollbackSweepTriggerCommand } from "./admin-vibe-cron-sweeps/rollback-sweep-trigger.command";

export function registerVibeRollbackSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-rollback-sweep")
    .description("Operate the Vibe cost-safety rollback sweep cron");

  registerVibeRollbackSweepTriggerCommand(sweep, admin, program);
}

export function registerVibeBuildJobTimeoutSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-build-job-timeout-sweep")
    .description("Operate the Vibe build-job timeout sweep cron");

  registerVibeBuildJobTimeoutSweepTriggerCommand(sweep, admin, program);
}
