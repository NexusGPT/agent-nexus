import type { RoleAutomationSettingsBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { readNullableString } from "../_shared/read-nullable-string";
import { readPositiveNumber } from "../_shared/read-positive-number";
import { requireAll } from "../_shared/require-all";

/** `nexus role set-automation-settings` */
export function registerRoleSetAutomationSettingsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-automation-settings")
    .description("Replace the organization's working-time assumptions and currency")
    .option("--hours-per-day <n>", "Hours in a working day, greater than 0")
    .option("--days-per-week <n>", "Days in a working week, greater than 0")
    .option("--working-weeks <n>", "Working weeks in a year, greater than 0")
    .option("--currency <code>", 'ISO 4217 code such as EUR, or "none" to clear it')
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-automation-settings --hours-per-day 8 --days-per-week 5 \\
      --working-weeks 46 --currency EUR

Notes:
  ALL FOUR ARE REQUIRED — this replaces the whole object, so an omitted field is
  a 400 rather than "leave it alone". The command names every missing one at
  once instead of making you discover them one 400 at a time.

  The three numbers have NO null form: a zero-length day makes every coverage
  figure in the organization unusable. --currency none IS accepted and means the
  organization states no currency, which turns every money figure into
  "not modelled".`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const fromFlags = {
          hoursPerDay:
            opts.hoursPerDay === undefined
              ? undefined
              : readPositiveNumber(String(opts.hoursPerDay), "--hours-per-day"),
          daysPerWeek:
            opts.daysPerWeek === undefined
              ? undefined
              : readPositiveNumber(String(opts.daysPerWeek), "--days-per-week"),
          workingWeeksPerYear:
            opts.workingWeeks === undefined
              ? undefined
              : readPositiveNumber(String(opts.workingWeeks), "--working-weeks"),
          currency:
            opts.currency === undefined ? undefined : readNullableString(String(opts.currency))
        };
        const body = mergeBodyWithFlags(base, fromFlags);
        requireAll(
          body,
          [
            { field: "hoursPerDay", flag: "hours-per-day" },
            { field: "daysPerWeek", flag: "days-per-week" },
            // The body key is workingWeeksPerYear; the option is --working-weeks.
            { field: "workingWeeksPerYear", flag: "working-weeks" },
            { field: "currency", flag: "currency" }
          ],
          "This route replaces the whole object, so every field must be sent."
        );
        const settings = await client.roles.upsertAutomationSettings(
          asRequestBody<RoleAutomationSettingsBody>(body)
        );

        printSuccess("Automation settings updated.", {
          hoursPerDay: settings.hoursPerDay,
          daysPerWeek: settings.daysPerWeek,
          workingWeeksPerYear: settings.workingWeeksPerYear,
          // A null currency is why a coverage read answers money "not modelled",
          // so a script has to be able to see it as a null.
          currency: settings.currency ?? absent("(none stated)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
