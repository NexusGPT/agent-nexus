import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { COVERAGE_REASON_VOCABULARY } from "../body-shapes/coverage-reason-vocabulary";
import { COVERAGE_INPUTS_NOTE } from "../copy/coverage-inputs-note";
import { renderRoleCoverage } from "./coverage.render";

/** `nexus role coverage` */
export function registerRoleCoverageCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("coverage")
    .description("Show a Role's automation coverage, its assumptions and its money figures")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role coverage "Support agent"
  $ nexus role coverage "Support agent" --json

Notes:
  THIS RESPONSE CARRIES LABOUR COST. money.totals.workloadCost is the Role's
  annual salary-and-seat cost, and savingsProjection.ratePerHour is a blended
  pay rate. Holding role_coverage:read is NECESSARY AND NOT SUFFICIENT — the
  server also checks the key OWNER's coverage.view permission on this Role, so
  a valid key can still get a 403.

  "not modelled" is NOT 0% and NOT 100%. An empty contributions list beside a
  populated unmodelledSystems list means nobody has modelled anything.
${COVERAGE_REASON_VOCABULARY}
${COVERAGE_INPUTS_NOTE}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.getCoverage(await resolveRoleId(client, ref));

        renderRoleCoverage(view);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
