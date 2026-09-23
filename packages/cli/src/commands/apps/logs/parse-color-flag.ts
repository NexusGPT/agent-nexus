import { isVibeLogColor, type VibeLogColor } from "../../../vibe-wire-types";

/**
 * `--color blue|green`, case-insensitively.
 *
 * Accepted in either case and always SENT lower-case: the database enum spells
 * these `BLUE`/`GREEN`, so an operator who has read a deployment record will
 * reasonably type the upper-case form, while the value the log store indexes is
 * lower-case. Matching on the wrong case matches nothing, silently — which is
 * the failure this normalisation exists to make unreachable.
 */
export function parseColorFlag(raw: string | undefined): VibeLogColor | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!isVibeLogColor(normalized)) {
    throw new Error(`--color must be blue or green (got "${raw}").`);
  }
  return normalized;
}
