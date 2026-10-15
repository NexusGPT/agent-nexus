/**
 * `nexus admin vibe-tenant-cluster complete-teardown` — the NEX-2869 escape
 * hatch.
 *
 * 🚨 A DELIBERATE BYPASS OF THE AUTOMATED SAFETY CHECK, for a cluster whose
 * `pulumi destroy` already ran but whose final DESTROYING → DESTROYED write
 * never landed. The reaper's own capture gate then refuses forever, because it
 * cannot tell "never protected" from "already destroyed" once the AWS Backup
 * plans are gone. This writes DESTROYED on the strength of the OPERATOR's
 * verification against real AWS, not the automation's.
 */

import type { Command } from "commander";

import { type VibeTenantClusterCompleteTeardownOutcomeRead } from "../../admin-vibe-tenant-cluster-wire-types";
import { AdminCliError, handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printCompleteTeardownOutcome } from "../admin-vibe-tenant-cluster.print-repair";

const HELP = `
🚨 DELIBERATE BYPASS OF THE AUTOMATED SAFETY CHECK. Only for a cluster whose
\`pulumi destroy\` already ran but whose final DESTROYING → DESTROYED write
never landed (a crash, or the write itself failed) — the reaper's own
capture gate then refuses forever, because it cannot tell "never protected"
apart from "already destroyed" once the AWS Backup plans are gone. This
command skips that gate and writes DESTROYED directly, on the strength of
YOUR verification against real AWS, not the automation's.

Examples:
  $ nexus admin vibe-tenant-cluster complete-teardown org_abc --confirmation "verified zero EC2/RDS/S3 resources tagged organizationId=org_abc in eu-west-3 via console, 2026-08-20"

Outcome shapes:
  destroyed          DESTROYING → DESTROYED. Your confirmation is now the
                      cluster's terminal statusReason.
  already_destroyed  No-op — the reaper (or another operator) already
                      finished this.
  not_destroying     Refused — the cluster exists but is not DESTROYING;
                      status says what it actually is. This command only
                      COMPLETES an already-claimed teardown, it never starts
                      one.
  not_found           The org has no dedicated cluster row at all.

Notes:
  Never use this to abandon a cluster that has not actually been torn
  down — it does not run \`pulumi destroy\`, it only records that one
  already ran. Refuses outright on anything not already DESTROYING.

  --confirmation is mandatory and becomes the terminal statusReason, so
  it is the only surviving record of HOW the teardown was verified. Name
  what you checked and where, not why you ran the command.

  The write is a status-guarded compare-and-swap, so it is safe to re-run:
  losing the race to the reaper (or to a second operator) reports
  already_destroyed rather than writing twice.
`;

/** Registers the verb on the `vibe-tenant-cluster` command group. */
export function registerVibeTenantClusterCompleteTeardownCommand(
  tc: Command,
  admin: Command,
  program: Command
): void {
  tc.command("complete-teardown")
    .description("Mark a wedged DESTROYING cluster DESTROYED (escape hatch, NEX-2869)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--confirmation <text>",
      "Your attestation that this org's infrastructure is confirmed gone, and HOW " +
        "you checked (not merely why you're running this). Becomes the cluster's " +
        "terminal statusReason — required."
    )
    .addHelpText("after", HELP)
    .action(async (organizationId: string, cmdOpts: { confirmation: string }) => {
      try {
        const confirmation = cmdOpts.confirmation.trim();
        if (confirmation.length === 0) {
          throw AdminCliError.localValidation("--confirmation cannot be empty.");
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterCompleteTeardownOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/complete-teardown",
          body: { organizationId, confirmation }
        });
        printCompleteTeardownOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
