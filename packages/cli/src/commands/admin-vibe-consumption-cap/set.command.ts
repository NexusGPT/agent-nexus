/**
 * `nexus admin vibe-consumption-cap set` — a tri-state PATCH.
 *
 * Each flag has THREE meanings: omitted leaves the column untouched, "none"
 * clears the override, an integer installs one. That three-way split is the
 * whole reason `parseCapFlag` exists as its own function and never sees the
 * omitted case — the caller decides presence, the parser decides value.
 */

import type { Command } from "commander";

import type {
  CapPatchValue,
  VibeOrgConsumptionCapResponse
} from "../../admin-vibe-cost-safety-wire-types";
import { AdminCliError, handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { parseCapFlag } from "./_shared/parse-cap-flag";
import { printConsumptionCapRecord } from "./_shared/print-consumption-cap-record";

const HELP = `
Examples:
  Install a higher compute cap on a heavy customer (other columns untouched):
    $ nexus admin vibe-consumption-cap set org_abc --compute 50000

  Clear the compute override (back to platform default), bump build:
    $ nexus admin vibe-consumption-cap set org_abc --compute none --build 10000

  Forbid all egress for an under-investigation org:
    $ nexus admin vibe-consumption-cap set org_abc --egress 0

Notes:
  Tri-state PATCH — each flag has THREE meanings:
    - omitted        : the column is not in the request body. The backend
                       leaves the existing value untouched.
    - "none"         : the column is sent as JSON null. The backend clears
                       the override; the rollup will use the platform
                       default for that column going forward.
    - <integer>      : the column is sent as a non-negative integer. The
                       backend installs the override.

  At least one flag is required (empty body would be a no-op PATCH and is
  refused locally with exit 5, mirroring the backend's 422).
`;

/** Registers the verb on the `vibe-consumption-cap` command group. */
export function registerVibeConsumptionCapSetCommand(
  cap: Command,
  admin: Command,
  program: Command
): void {
  cap
    .command("set")
    .description("Install / clear per-org consumption-cap overrides (tri-state PATCH)")
    .argument("<organizationId>", "Target organization id")
    .option(
      "--compute <int|none>",
      'Compute-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--build <int|none>",
      'Build-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--egress <int|none>",
      'Egress-MB cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .addHelpText("after", HELP)
    .action(
      async (
        organizationId: string,
        cmdOpts: { compute?: string; build?: string; egress?: string }
      ) => {
        try {
          const body: {
            computeMinCap?: CapPatchValue;
            buildMinCap?: CapPatchValue;
            egressMbCap?: CapPatchValue;
          } = {};
          if (cmdOpts.compute !== undefined) {
            body.computeMinCap = parseCapFlag("--compute", cmdOpts.compute);
          }
          if (cmdOpts.build !== undefined) {
            body.buildMinCap = parseCapFlag("--build", cmdOpts.build);
          }
          if (cmdOpts.egress !== undefined) {
            body.egressMbCap = parseCapFlag("--egress", cmdOpts.egress);
          }

          if (Object.keys(body).length === 0) {
            throw AdminCliError.localValidation(
              'At least one of --compute / --build / --egress is required. Pass an int to install, "none" to clear, omit to leave a column untouched.'
            );
          }

          const opts = resolveAdminOpts(program, admin);
          const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
            method: "PATCH",
            path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`,
            body
          });
          printConsumptionCapRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );
}
