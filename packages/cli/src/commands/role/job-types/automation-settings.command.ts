import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printStatedOrNothing } from "../_shared/print-stated-or-nothing";

/** `nexus role automation-settings` */
export function registerRoleAutomationSettingsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("automation-settings")
    .description("Read the organization's working-time assumptions and currency")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role automation-settings

Notes:
  Every coverage figure in the organization rests on these three numbers, and a
  null currency is why a coverage read can answer money "not modelled".

  THE WHOLE OBJECT CAN BE ABSENT, AND ABSENCE IS A SUCCESS. An organization
  that never stated its working time has no settings row at all: this exits 0,
  prints "not configured", and under --json emits the literal document null —
  not {}, not an error. That null is what makes coverage.reason answer
  NO_WORKING_TIME_MODEL for EVERY Role in the organization at once, so read it
  here before treating a "not modelled" coverage figure as a per-Role problem.
  Write the row with "nexus role set-automation-settings".`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const settings = await client.roles.getAutomationSettings();

        printStatedOrNothing(settings, "This organization's automation settings", [
          { key: "organizationId", label: "Organization" },
          { key: "hoursPerDay", label: "Hours / day" },
          { key: "daysPerWeek", label: "Days / week" },
          { key: "workingWeeksPerYear", label: "Working weeks / yr" },
          {
            key: "currency",
            label: "Currency",
            format: (val) => (val === null ? "(none stated)" : String(val))
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
