/**
 * `nexus admin vibe-tenant-cluster force-converge` — the HEALTHY-only lever.
 *
 * 🔴 NOT A GENERAL "UNSTICK A DEGRADED CLUSTER" LEVER. The reconcile loop
 * already retries `pulumi up` on PROVISIONING / UPDATING / DEGRADED every tick
 * on its own, so calling this against an already-DEGRADED cluster returns
 * `already_converging` and writes nothing. Its actual job is unsticking a
 * HEALTHY cluster whose drift PREVIEW is wrong — reports clean while a declared
 * resource is missing live — which is the one state the loop cannot
 * self-correct from, because HEALTHY is only observed, never driven.
 */

import type { Command } from "commander";

import { type VibeTenantClusterForceConvergeOutcomeRead } from "../../admin-vibe-tenant-cluster-wire-types";
import { AdminCliError, handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printForceConvergeOutcome } from "../admin-vibe-tenant-cluster.print-repair";

const HELP = `
🔴 HEALTHY-only. The reconcile loop already retries PROVISIONING / UPDATING /
DEGRADED clusters every tick with no help from this command — see the
already_converging outcome below. This exists for the one state the loop
cannot self-correct: a HEALTHY cluster whose drift PREVIEW reports clean
while a declared resource is actually missing from live infrastructure, so
the loop never has a reason to degrade (and therefore converge) it.

Examples:
  $ nexus admin vibe-tenant-cluster force-converge org_abc --reason "drift preview missing the NAT gateway, confirmed via aws ec2 describe-nat-gateways"

Outcome shapes:
  forced               HEALTHY → DEGRADED, converges on the next tick.
  already_converging   No-op — already PROVISIONING / UPDATING / DEGRADED,
                        which the loop already converges every tick.
  reconcile_paused      No-op — an operator is holding this cluster out
                        of the sweep with reconcile-pause. Release the
                        pause first, or nothing will ever converge.
  not_converging        Refused — a draining/retired cluster has no
                        desired state to converge toward.
  not_found             The org has no dedicated cluster.

Notes:
  It writes one column and returns; the reconcile cron does the actual
  apply under its crash-safe lease. "forced" means a converge WILL run on
  the next tick, not that one already has.

  --reason is mandatory and becomes the cluster's statusReason, so it is
  what the next operator reads to understand why the cluster left HEALTHY.
  Say what you verified, not that you forced it.

  There is no admin CLI verb to poll a single cluster's status yet — check
  the admin panel, or GET /api/admin/vibe/tenant-cluster for the fleet
  roster.
`;

/** Registers the verb on the `vibe-tenant-cluster` command group. */
export function registerVibeTenantClusterForceConvergeCommand(
  tc: Command,
  admin: Command,
  program: Command
): void {
  tc.command("force-converge")
    .description("Force a HEALTHY cluster whose drift preview is wrong to converge")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--reason <text>",
      "Why you are forcing this. Becomes the cluster's statusReason on success — required."
    )
    .addHelpText("after", HELP)
    .action(async (organizationId: string, cmdOpts: { reason: string }) => {
      try {
        const reason = cmdOpts.reason.trim();
        if (reason.length === 0) {
          throw AdminCliError.localValidation("--reason cannot be empty.");
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterForceConvergeOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/force-converge",
          body: { organizationId, reason }
        });
        printForceConvergeOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
