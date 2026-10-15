/**
 * `--duration-ms` parsing for the three verbs that record a wallclock.
 *
 * Refuses locally and exits 5 rather than spending a round trip to be told the
 * same thing by the backend's Zod boundary.
 */

import { AdminCliError } from "../../../util/admin-errors";

export function parseDurationMs(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid --duration-ms value "${raw}". Expected a non-negative integer.`
    );
  }
  return parsed;
}
