/**
 * Parsing the `list` verb's paging flags.
 *
 * Its own module rather than a helper inside `list.command.ts`, because the
 * reasoning below is the longest thing in that verb and has nothing to do with
 * the command's wiring.
 */

import { AdminCliError } from "../../../util/admin-errors";

/**
 * Parse a paging flag, or return `undefined` when the operator omitted it.
 *
 * `undefined` is dropped from the query string by `adminRequest`, so the
 * SERVER's default applies. Re-declaring a default here would fork it the day
 * the server's default changes, and the CLI would then page differently from
 * the endpoint it is a window onto.
 *
 * The digits-only test is deliberate: `Number()` alone accepts `0x10`, `1e3`
 * and `+5`, all of which would reach the server as a value the operator did
 * not type.
 */
export function parsePagingFlag(
  flag: string,
  raw: string | undefined,
  min: number,
  max?: number
): number | undefined {
  if (raw === undefined) return undefined;
  const bounds = max === undefined ? `>= ${min}` : `in [${min}, ${max}]`;
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (
    !/^\d+$/.test(trimmed) ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    throw AdminCliError.localValidation(`Invalid ${flag} "${raw}". Expected an integer ${bounds}.`);
  }
  return parsed;
}
