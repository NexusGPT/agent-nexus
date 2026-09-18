import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { NOT_STATED, WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK } from "../../role-coverage-copy";
import { printStatedOrNothing } from "../_shared/print-stated-or-nothing";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role working-year` */
export function registerRoleWorkingYearCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("working-year")
    .description("Read a Role's working year")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role working-year "Support agent"

Notes:${WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const year = await client.roles.getWorkingYear(await resolveRoleId(client, ref));
        const notStated = (val: unknown): string => (val === null ? NOT_STATED : String(val));

        printStatedOrNothing(year, "This Role's working year", [
          { key: "roleId", label: "Role" },
          { key: "calendarWeeks", label: "Calendar weeks", format: notStated },
          { key: "paidLeaveWeeks", label: "Paid leave (weeks)", format: notStated },
          { key: "publicHolidayDays", label: "Public holidays (days)", format: notStated },
          { key: "sicknessDays", label: "Sickness (days)", format: notStated }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
