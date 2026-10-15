/**
 * Narrowing an operator-typed cost-safety status onto the wire enum.
 *
 * Shared by `set` (which requires one) and `list` (where absence means "every
 * status", not "none") — which is the whole reason the optional variant exists
 * as its own function rather than as a caller-side `if`.
 *
 * The refusals here happen BEFORE the HTTP call and exit 5, mirroring the
 * backend's 422 rather than spending a round trip to be told the same thing.
 */

import {
  COST_SAFETY_STATUS_VALUES,
  type CostSafetyStatus
} from "../../../admin-vibe-cost-safety-wire-types";
import { AdminCliError } from "../../../util/admin-errors";

/** Narrow an operator-typed string onto the wire enum. */
export function isCostSafetyStatus(v: string): v is CostSafetyStatus {
  return (COST_SAFETY_STATUS_VALUES as readonly string[]).includes(v);
}

/** Validate a status the operator typed. Refuses before the HTTP call (exit 5). */
export function parseStatus(raw: string): CostSafetyStatus {
  const status = raw.toUpperCase();
  if (!isCostSafetyStatus(status)) {
    throw AdminCliError.localValidation(
      `Invalid --status "${raw}". Allowed: ${COST_SAFETY_STATUS_VALUES.join(", ")}.`
    );
  }
  return status;
}

/** Same, for a filter flag where absence means "every status", not "none". */
export function parseOptionalStatus(raw: string | undefined): CostSafetyStatus | undefined {
  return raw === undefined ? undefined : parseStatus(raw);
}
