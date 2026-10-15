/**
 * `nexus admin vibe-tenant-cluster …` — the per-tenant data-plane lifecycle.
 *
 * Five verbs over one resource: `provision` opts an org into its own cluster,
 * `disable` opts it out to DISABLED_RETAINED; `force-converge` and
 * `complete-teardown` are the operator repair levers (NEX-4213); and
 * `request-server-roll` asks a serving cluster to roll its servers.
 *
 * 🔴 `force-converge` IS NOT A GENERAL "UNSTICK A DEGRADED CLUSTER" LEVER — read
 * its own `--help`, or the header of its module. It is HEALTHY-only.
 *
 * All five responses are DISCRIMINATED outcomes rather than a flat record, so
 * each has its own printer instead of a shared one — in
 * `admin-vibe-tenant-cluster.print-lifecycle.ts`, `.print-repair.ts` and
 * `.print-server-roll.ts`, where the exhaustive `never` default pins each to
 * the schema and a kind newer than this binary prints as the server's word.
 *
 * ⚠️ THIS FAMILY NOW CARRIES TWO FILE CONVENTIONS, AND THE SPLIT IS DELIBERATE.
 * The four verbs below live in `admin-vibe-tenant-cluster/<verb>.command.ts`,
 * the wave-1 house shape. `request-server-roll` and the three printers are
 * DOTTED TOP-LEVEL siblings (`admin-vibe-tenant-cluster.request-server-roll.ts`
 * and friends) — they predate this change, they are already within both ESLint
 * caps, and no cap is armed over them. Moving them would be a rename of files
 * this change has no reason to touch, so they stay where they are and the
 * directory glob covers only what this change created.
 *
 * 🚨 THIS FILE IS WIRING. A new verb is a new module plus one line here, never a
 * block appended below. ESLint caps this file at 150 lines and every function
 * at 80, so a verb that grows in place is a lint error rather than a review
 * judgement.
 */

import { Command } from "commander";

import { registerRequestServerRollCommand } from "./admin-vibe-tenant-cluster.request-server-roll";
import { registerVibeTenantClusterCompleteTeardownCommand } from "./admin-vibe-tenant-cluster/complete-teardown.command";
import { registerVibeTenantClusterDisableCommand } from "./admin-vibe-tenant-cluster/disable.command";
import { registerVibeTenantClusterForceConvergeCommand } from "./admin-vibe-tenant-cluster/force-converge.command";
import { registerVibeTenantClusterProvisionCommand } from "./admin-vibe-tenant-cluster/provision.command";

export function registerVibeTenantClusterCommands(admin: Command, program: Command): void {
  const tc = admin
    .command("vibe-tenant-cluster")
    .description("Provision / disable an org's dedicated Vibe data-plane cluster");

  registerVibeTenantClusterProvisionCommand(tc, admin, program);
  registerVibeTenantClusterDisableCommand(tc, admin, program);
  registerVibeTenantClusterForceConvergeCommand(tc, admin, program);
  registerVibeTenantClusterCompleteTeardownCommand(tc, admin, program);
  registerRequestServerRollCommand(tc, admin, program);
}
