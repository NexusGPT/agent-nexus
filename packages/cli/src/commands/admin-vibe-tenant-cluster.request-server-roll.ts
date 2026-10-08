/**
 * `nexus admin vibe-tenant-cluster request-server-roll` — ask one serving
 * cluster to roll every Nomad/Consul server through the existing roll path.
 *
 * Its own module so `admin-vibe-tenant-cluster.ts`, which registers the other
 * verbs on the same resource, does not grow past what one reader holds.
 */

import type { Command } from "commander";

import type { VibeTenantClusterRequestServerRollOutcomeRead } from "../admin-vibe-tenant-cluster-server-roll-wire-types";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";
import { printRequestServerRollOutcome } from "./admin-vibe-tenant-cluster.print-server-roll";

const HELP = `
🔴 HEALTHY-only, and nothing is rolled by hand. The request stamps a server roll
generation that the provisioner writes into the server boot script, and moves the
cluster HEALTHY → DEGRADED so the next reconcile tick converges it. That converge
mints a launch template every server is stale against, and the EXISTING server
roll does the rest: one surge member, then raft-aware retirement of the old
servers one at a time. No Auto Scaling group or instance is touched by this verb.

Examples:
  $ nexus admin vibe-tenant-cluster request-server-roll org_abc --reason "agent-only change; verify the server roll path on staging"

Outcome shapes:
  requested          HEALTHY → DEGRADED with a new generation; rolls from the
                     next tick.
  already_pending    No-op — the last generation has not settled. A second one
                     would only restart a roll in flight.
  reconcile_paused   Refused — the cluster is held out of the sweep, so nothing
                     would ever converge. Release the pause first.
  not_settled        Refused — only a HEALTHY cluster can be asked: a converge
                     already in flight carries no generation.
  not_found          The org has no dedicated cluster.

Notes:
  "requested" means a roll WILL run, not that one has. The fleet roster's
  serverRoll column (GET /api/admin/vibe/tenant-cluster) says whether it is
  still pending.
`;

/** Registers the verb on the `vibe-tenant-cluster` command group. */
export function registerRequestServerRollCommand(
  tc: Command,
  admin: Command,
  program: Command
): void {
  tc.command("request-server-roll")
    .description("Ask a HEALTHY cluster to roll every server through the existing roll path")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--reason <text>",
      "Why the servers should roll. Recorded with the generation and in the cluster's statusReason — required."
    )
    .addHelpText("after", HELP)
    .action(async (organizationId: string, cmdOpts: { reason: string }) => {
      try {
        const reason = cmdOpts.reason.trim();
        if (reason.length === 0) {
          throw AdminCliError.localValidation("--reason cannot be empty.");
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterRequestServerRollOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/request-server-roll",
          body: { organizationId, reason }
        });
        printRequestServerRollOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
