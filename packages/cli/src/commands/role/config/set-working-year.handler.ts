import type { NexusClient, RoleWorkingYear, RoleWorkingYearBody } from "@agent-nexus/sdk";

import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { readNullableNumber } from "../_shared/read-nullable-number";
import { requireAll } from "../_shared/require-all";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** The options `nexus role set-working-year` declares, as commander hands them to the action. */
export interface RoleSetWorkingYearOptions {
  calendarWeeks?: string;
  paidLeave?: string;
  publicHolidays?: string;
  sickness?: string;
  body?: string;
}

/**
 * Resolves the Role, merges `--body` with the four terms — `none` read as
 * null — refuses a partial object naming both paths, and replaces the
 * working year.
 */
export async function setRoleWorkingYear(
  client: NexusClient,
  ref: string,
  opts: RoleSetWorkingYearOptions
): Promise<RoleWorkingYear> {
  const roleId = await resolveRoleId(client, ref);
  const base = await resolveBody(opts.body);
  const body = mergeBodyWithFlags(base, {
    calendarWeeks:
      opts.calendarWeeks === undefined
        ? undefined
        : readNullableNumber(String(opts.calendarWeeks), "--calendar-weeks"),
    paidLeaveWeeks:
      opts.paidLeave === undefined
        ? undefined
        : readNullableNumber(String(opts.paidLeave), "--paid-leave"),
    publicHolidayDays:
      opts.publicHolidays === undefined
        ? undefined
        : readNullableNumber(String(opts.publicHolidays), "--public-holidays"),
    sicknessDays:
      opts.sickness === undefined
        ? undefined
        : readNullableNumber(String(opts.sickness), "--sickness")
  });
  requireAll(
    body,
    [
      { field: "calendarWeeks", flag: "calendar-weeks" },
      // Three of these four options are SHORTER than their body keys.
      { field: "paidLeaveWeeks", flag: "paid-leave" },
      { field: "publicHolidayDays", flag: "public-holidays" },
      { field: "sicknessDays", flag: "sickness" }
    ],
    'This route replaces the whole object. Pass "none" for a term nobody has stated.'
  );
  return client.roles.upsertWorkingYear(roleId, asRequestBody<RoleWorkingYearBody>(body));
}
