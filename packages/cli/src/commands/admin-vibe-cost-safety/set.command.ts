/**
 * `nexus admin vibe-cost-safety set` — the operator escape hatch.
 *
 * SUSPENDED is the state that refuses an org new deploys, and `--reason` is
 * what the refusal quotes back, so the local refusal below exists to stop a
 * SUSPEND landing with nothing to show the customer.
 */

import type { Command } from "commander";

import type {
  CostSafetyStatus,
  VibeOrgCostSafetyStateResponse
} from "../../admin-vibe-cost-safety-wire-types";
import { AdminCliError, handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { parseStatus } from "./_shared/parse-status";
import { printCostSafetyRecord } from "./_shared/print-cost-safety-record";

const HELP = `
Examples:
  $ nexus admin vibe-cost-safety set org_abc --status SUSPENDED --reason "fraud investigation"
  $ nexus admin vibe-cost-safety set org_abc --status OK
  $ nexus admin vibe-cost-safety set org_abc --status WARNING

Notes:
  --reason is required when --status SUSPENDED (refused locally before the
  HTTP call, mirroring the backend's 422). For non-SUSPENDED statuses any
  reason passed is dropped — the use case normalizes the column to null
  so flipping back to OK never carries a stale rationale forward.
`;

/** Registers the verb on the `vibe-cost-safety` command group. */
export function registerVibeCostSafetySetCommand(
  cs: Command,
  admin: Command,
  program: Command
): void {
  cs.command("set")
    .description("Flip one org's cost-safety state (operator escape hatch)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption("--status <status>", "OK | WARNING | SUSPENDED")
    .option(
      "--reason <text>",
      "Required when --status SUSPENDED. 1-500 chars. Carried verbatim into the refuse-deploy HTTP message for the gated org."
    )
    .addHelpText("after", HELP)
    .action(async (organizationId: string, cmdOpts: { status: string; reason?: string }) => {
      try {
        const status = parseStatus(cmdOpts.status);
        const trimmedReason = cmdOpts.reason?.trim();
        if (status === "SUSPENDED" && !trimmedReason) {
          throw AdminCliError.localValidation(
            "--reason is required (non-empty) when --status SUSPENDED."
          );
        }

        // Body only carries the reason when SUSPENDED. The backend normalizes
        // non-SUSPENDED requests to null anyway, but sending a stale reason
        // would still surface in the audit trail's request payload — keep it
        // out so the audit row only carries the rationale that the gate
        // actually uses.
        const body: { status: CostSafetyStatus; suspendedReason?: string } = { status };
        if (status === "SUSPENDED" && trimmedReason) {
          body.suspendedReason = trimmedReason;
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "PATCH",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`,
          body
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
