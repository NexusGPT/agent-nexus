/**
 * `nexus admin vibe-consumption-cap get` — the override AND the resolved cap.
 *
 * Surfacing both side by side is what lets an operator tell "an explicit cap
 * that happens to equal the default" apart from "no override at all".
 */

import type { Command } from "commander";

import type { VibeOrgConsumptionCapResponse } from "../../admin-vibe-cost-safety-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printConsumptionCapRecord } from "./_shared/print-consumption-cap-record";

const HELP = `
Examples:
  $ nexus admin vibe-consumption-cap get org_abc123
  $ nexus admin vibe-consumption-cap get org_abc123 --json

Notes:
  computeMinCap / buildMinCap / egressMbCap   Raw override. null = no
                                              override → falls back to the
                                              platform default for that
                                              column.
  effective<Type>Cap                          Resolved value the rollup cron
                                              compares per-tenant consumption
                                              against (override ?? platform
                                              default). Surfacing both lets
                                              the admin distinguish "explicit
                                              cap that happens to equal the
                                              default" from "no override".
  present                                     false = no row exists. true =
                                              row exists, even if all
                                              columns are null (explicit
                                              "leave at defaults" intent).
`;

/** Registers the verb on the `vibe-consumption-cap` command group. */
export function registerVibeConsumptionCapGetCommand(
  cap: Command,
  admin: Command,
  program: Command
): void {
  cap
    .command("get")
    .description("Read one org's consumption-cap overrides + resolved effective caps")
    .argument("<organizationId>", "Target organization id")
    .addHelpText("after", HELP)
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`
        });
        printConsumptionCapRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
