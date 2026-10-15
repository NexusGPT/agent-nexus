/**
 * Parsing one tri-state cap flag. Reached only by `set`.
 */

import type { CapPatchValue } from "../../../admin-vibe-cost-safety-wire-types";
import { AdminCliError } from "../../../util/admin-errors";

/**
 * Parse a tri-state cap flag value. Returns:
 *   - null  for the literal string "none" (case-insensitive)
 *   - the parsed integer for anything else
 *
 * Throws `AdminCliError.localValidation` on NaN / negative / non-integer.
 * The caller is responsible for deciding whether to put the result in the
 * body (because the flag was present) or skip it (because the flag was
 * omitted). This function never sees the omitted case.
 */
export function parseCapFlag(flag: string, raw: string): CapPatchValue {
  if (raw.trim().toLowerCase() === "none") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid ${flag} value "${raw}". Expected a non-negative integer or "none".`
    );
  }
  return parsed;
}
