/**
 * `nexus admin vibe-tenant-cluster disable` — opt an org out, to
 * DISABLED_RETAINED.
 *
 * Reversible until the grace window expires: re-provisioning a
 * DISABLED_RETAINED org before the teardown reaper runs resumes it. After the
 * reaper destroys the stacks the org provisions fresh.
 */

import type { Command } from "commander";

import { type VibeTenantClusterDisableOutcomeRead } from "../../admin-vibe-tenant-cluster-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDisableOutcome } from "../admin-vibe-tenant-cluster.print-lifecycle";

const HELP = `
Examples:
  $ nexus admin vibe-tenant-cluster disable org_abc
  $ nexus admin vibe-tenant-cluster disable org_abc --json

Outcome shapes:
  retained          The cluster is now DISABLED_RETAINED; retainUntil is
                    the instant the teardown reaper may destroy it.
  already_retained  It was already retained — no-op.
  not_found         The org has no dedicated cluster.
  not_disablable    The cluster is in a state that is not a disable source
                    (PROVISIONING / UPDATING / a retired state); status
                    says which.

Notes:
  Disable is reversible until the grace window expires — re-provisioning
  a DISABLED_RETAINED org before the reaper runs resumes it. After the
  reaper destroys the stacks the org provisions fresh.
`;

/** Registers the verb on the `vibe-tenant-cluster` command group. */
export function registerVibeTenantClusterDisableCommand(
  tc: Command,
  admin: Command,
  program: Command
): void {
  tc.command("disable")
    .description("Opt an org out of its dedicated cluster (→ DISABLED_RETAINED)")
    .argument("<organizationId>", "Target organization id")
    .addHelpText("after", HELP)
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterDisableOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/disable",
          body: { organizationId }
        });
        printDisableOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
