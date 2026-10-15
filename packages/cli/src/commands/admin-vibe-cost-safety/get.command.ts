/**
 * `nexus admin vibe-cost-safety get` — one org's cost-safety state.
 *
 * Defaults to OK when no row exists, which is why the response carries
 * `present` as well as `status`: without it, "explicitly set back to OK" and
 * "never touched" are the same answer.
 */

import type { Command } from "commander";

import type { VibeOrgCostSafetyStateResponse } from "../../admin-vibe-cost-safety-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printCostSafetyRecord } from "./_shared/print-cost-safety-record";

const HELP = `
Examples:
  $ nexus admin vibe-cost-safety get org_abc123
  $ nexus admin vibe-cost-safety get org_abc123 --json

Notes:
  status            OK | WARNING | SUSPENDED. SUSPENDED refuses new deploys.
  suspendedReason   Carried verbatim into the refuse-deploy HTTP message.
  present           false = no row exists (treated as OK at the deploy gate).
                    true  = a row exists, even if it's been explicitly set back to OK.
`;

/** Registers the verb on the `vibe-cost-safety` command group. */
export function registerVibeCostSafetyGetCommand(
  cs: Command,
  admin: Command,
  program: Command
): void {
  cs.command("get")
    .description("Read one org's cost-safety state (defaults to OK when no row exists)")
    .argument("<organizationId>", "Target organization id")
    .addHelpText("after", HELP)
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
