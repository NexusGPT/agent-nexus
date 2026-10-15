/**
 * `nexus admin vibe-deployment …` — the deployment state machine, by hand.
 *
 * Six verbs, one per transition: build-succeeded, await-approval, begin-deploy,
 * mark-healthy, mark-failed and mark-rolled-back. Symmetric to vibe-build-job —
 * same orgId-in-body convention, same admin-http transport, same exit codes.
 *
 * The next stage after a successful build is the USE CASE's decision, not the
 * operator's: it reads the approval-request row and branches to
 * AWAITING_APPROVAL or straight to DEPLOYING. This module only reports it.
 *
 * 🚨 THIS FILE IS WIRING. Each verb lives in its own module under
 * `admin-vibe-deployment/`, and a new one is a new module plus one line here,
 * never a block appended below. ESLint caps this file at 150 lines and every
 * function at 80, so a verb that grows in place is a lint error rather than a
 * review judgement.
 *
 * 🔴 The six registrars are NOT collapsed into a loop over a table, and that is
 * deliberate rather than an omission. `commands/json-shape.scan.ts` derives each
 * leaf's `--json` shape by tying a `.command("<name>")` registration to a
 * command PATH syntactically; a table-driven registration is a registration it
 * cannot tie, and the honest output for that is NO shape line at all. Six
 * near-identical registrars are the price of twenty-one `--json` sentences
 * staying derivable.
 */

import { Command } from "commander";

import { registerVibeDeploymentAwaitApprovalCommand } from "./admin-vibe-deployment/await-approval.command";
import { registerVibeDeploymentBeginDeployCommand } from "./admin-vibe-deployment/begin-deploy.command";
import { registerVibeDeploymentBuildSucceededCommand } from "./admin-vibe-deployment/build-succeeded.command";
import { registerVibeDeploymentMarkFailedCommand } from "./admin-vibe-deployment/mark-failed.command";
import { registerVibeDeploymentMarkHealthyCommand } from "./admin-vibe-deployment/mark-healthy.command";
import { registerVibeDeploymentMarkRolledBackCommand } from "./admin-vibe-deployment/mark-rolled-back.command";

export function registerVibeDeploymentCommands(admin: Command, program: Command): void {
  const dep = admin
    .command("vibe-deployment")
    .description(
      "Drive the Vibe deployment state machine (build-succeeded / await-approval / begin-deploy / mark-healthy / mark-failed / mark-rolled-back)"
    );

  // DECLARATION ORDER IS THE HELP ORDER. commander lists subcommands in the
  // order they are registered, and `cli-surface.generated.ts` pins it, so this
  // sequence is the state machine's own order and not alphabetical.
  registerVibeDeploymentBuildSucceededCommand(dep, admin, program);
  registerVibeDeploymentAwaitApprovalCommand(dep, admin, program);
  registerVibeDeploymentBeginDeployCommand(dep, admin, program);
  registerVibeDeploymentMarkHealthyCommand(dep, admin, program);
  registerVibeDeploymentMarkFailedCommand(dep, admin, program);
  registerVibeDeploymentMarkRolledBackCommand(dep, admin, program);
}
