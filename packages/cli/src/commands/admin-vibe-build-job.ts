/**
 * `nexus admin vibe-build-job …` — the build-job state machine, by hand.
 *
 * Four verbs, one per transition an operator can drive: claim, succeed, fail
 * and time-out. The build runner drives the same use cases through DI; these
 * exist for QA and for manual recovery when a job is wedged.
 *
 * `parseDurationMs`, under `admin-vibe-build-job/_shared/`, refuses locally and
 * exits 5 rather than spending a round trip to be told the same thing by the
 * backend's Zod boundary.
 *
 * 🚨 THIS FILE IS WIRING. Each verb lives in its own module under
 * `admin-vibe-build-job/`, and a new one is a new module plus one line here,
 * never a block appended below. ESLint caps this file at 150 lines and every
 * function at 80, so a verb that grows in place is a lint error rather than a
 * review judgement.
 */

import { Command } from "commander";

import { registerVibeBuildJobClaimCommand } from "./admin-vibe-build-job/claim.command";
import { registerVibeBuildJobFailCommand } from "./admin-vibe-build-job/fail.command";
import { registerVibeBuildJobSucceedCommand } from "./admin-vibe-build-job/succeed.command";
import { registerVibeBuildJobTimeOutCommand } from "./admin-vibe-build-job/time-out.command";

export function registerVibeBuildJobCommands(admin: Command, program: Command): void {
  const bj = admin
    .command("vibe-build-job")
    .description("Drive the Vibe build-job state machine (claim / succeed / fail / time-out)");

  // DECLARATION ORDER IS THE HELP ORDER, and `cli-surface.generated.ts` pins it:
  // this is the job's own lifecycle order, not alphabetical.
  registerVibeBuildJobClaimCommand(bj, admin, program);
  registerVibeBuildJobSucceedCommand(bj, admin, program);
  registerVibeBuildJobFailCommand(bj, admin, program);
  registerVibeBuildJobTimeOutCommand(bj, admin, program);
}
