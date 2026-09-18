import { isJsonMode, printRecord, type RecordField } from "../../../output";

/**
 * Report an unset row instead of crashing on it.
 *
 * 🚨 THREE READS ANSWER `null` WHEN NOTHING HAS BEEN AUTHORED — automation
 * settings, the working year and the system policy. `printRecord` reads fields off
 * its argument, so `null` throws `Cannot read properties of null`, and the
 * alternative of rendering blanks or `false` would report a configuration nobody
 * chose. "Nothing is stated" is the answer, and it is a SUCCESS: exit code 0, and
 * under `--json` a literal `null` so a script can branch on it.
 */
export function printStatedOrNothing<T extends object>(
  value: T | null,
  what: string,
  fields: readonly RecordField<T>[]
): boolean {
  if (value !== null) {
    printRecord(value, fields);
    return true;
  }
  if (isJsonMode()) {
    console.log(JSON.stringify(null, null, 2));
  } else {
    console.log(`${what} is not configured — nothing has been stated for it.`);
  }
  return false;
}
