import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../copy/job-model-does-not-move-coverage";
import { NOT_STATED } from "../copy/not-stated";
import { WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK } from "../copy/working-year-has-no-organization-fallback";
import { type RoleSetWorkingYearOptions, setRoleWorkingYear } from "./set-working-year.handler";

/** `nexus role set-working-year` */
export function registerRoleSetWorkingYearCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-working-year")
    .description("Replace a Role's working year")
    .argument("<role>", "Role name or UUID")
    .option("--calendar-weeks <n>", 'Weeks in the year, or "none" for no override')
    .option("--paid-leave <n>", 'Paid leave in weeks, or "none"')
    .option("--public-holidays <n>", 'Public holidays in days, or "none"')
    .option("--sickness <n>", 'Expected sickness in days, or "none"')
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-working-year "Support" --calendar-weeks 52 --paid-leave 5 \\
      --public-holidays 10 --sickness none

Notes:
  ALL FOUR ARE REQUIRED — this replaces the whole object.

  "none" MEANS NOT STATED. IT IS NOT ZERO. --sickness none records that nobody
  has stated expected sickness; --sickness 0 asserts zero expected sickness.
  Both are accepted, they produce different job-model denominators, and nothing
  downstream will tell you which you meant.
${WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK}
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts: RoleSetWorkingYearOptions) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const year = await setRoleWorkingYear(client, ref, opts);

        // 🚨 EACH OF THESE FOUR IS THE `none` A CALLER JUST SENT, READ BACK. The
        // whole point of the token is that null and 0 are different denominators,
        // so answering the null as English destroys the distinction on the one
        // channel that exists to preserve it — and `role working-year` returns
        // the same fields as proper nulls.
        printSuccess("Working year updated.", {
          calendarWeeks: year.calendarWeeks ?? absent(NOT_STATED),
          paidLeaveWeeks: year.paidLeaveWeeks ?? absent(NOT_STATED),
          publicHolidayDays: year.publicHolidayDays ?? absent(NOT_STATED),
          sicknessDays: year.sicknessDays ?? absent(NOT_STATED)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
