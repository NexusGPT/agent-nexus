import { InvalidArgumentError } from "commander";

/**
 * Canonical time-period enum values accepted by the analytics API.
 * Mirrors `TimePeriodSchema` in `@nexus/types`.
 */
export const TIME_PERIOD_VALUES = [
  "last_24_hours",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "last_12_months",
  "all_time"
] as const;

export type TimePeriod = (typeof TIME_PERIOD_VALUES)[number];

/**
 * Convenient shorthands accepted on the CLI and mapped to the canonical enum
 * the API expects. Keeps the friendly `30d` style documented in older help
 * text working instead of erroring with a validation error (NEX-2367).
 */
const SHORTHAND_MAP: Record<string, TimePeriod> = {
  "24h": "last_24_hours",
  "7d": "last_7_days",
  "30d": "last_30_days",
  "90d": "last_90_days",
  "12mo": "last_12_months",
  "12m": "last_12_months",
  "1y": "last_12_months",
  all: "all_time"
};

/**
 * The shorthands that normalise INTO a given set of canonical values.
 *
 * A flag offers these as `.choices()` alongside the canonical ones instead of
 * retyping them: a flag that normalises a spelling it does not advertise is a
 * flag whose help is wrong. It takes the set rather than returning all of them,
 * because the flags this feeds no longer share one enum.
 *
 * 🔴 **A flag whose contract enum is narrower than this module's must offer the
 * matching subset, or its help advertises a spelling its own parser refuses.**
 * `enumOption` normalises first and then validates the OUTPUT against the
 * descriptor's values, so `--time-period all` on a route that does not serve
 * `all_time` becomes `all_time` and is refused locally — correct behaviour, and
 * a lie in `--help` if `all` is still listed as accepted. The three
 * dashboard-backed analytics routes are exactly that case: `all_time` and
 * `last_24_hours` are served by the query endpoints and by neither of them.
 */
export function timePeriodShorthandsFor(canonical: readonly string[]): readonly string[] {
  const allowed = new Set(canonical);
  return Object.entries(SHORTHAND_MAP)
    .filter(([, value]) => allowed.has(value))
    .map(([shorthand]) => shorthand);
}

const VALID_ENUM = new Set<string>(TIME_PERIOD_VALUES);

/**
 * Human-readable summary of the accepted values, for `--help` text.
 *
 * The shorthand half is DERIVED rather than typed out: the hand-written list
 * here read `24h, 7d, 30d, 90d, 12mo, all` while the map also accepted `12m` and
 * `1y`, so two working spellings were undocumented.
 */
export function timePeriodHelpFor(canonical: readonly string[]): string {
  return `Time period: ${canonical.join(", ")} (shorthands: ${timePeriodShorthandsFor(
    canonical
  ).join(", ")})`;
}

/**
 * Normalize a user-supplied `--time-period` value to the canonical enum.
 * Accepts both the full enum values and the documented shorthands.
 * Throws `InvalidArgumentError` (handled by commander) for anything else.
 */
export function parseTimePeriod(value: string): TimePeriod {
  const normalized = value.trim().toLowerCase();

  if (VALID_ENUM.has(normalized)) {
    return normalized as TimePeriod;
  }

  const mapped = SHORTHAND_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  throw new InvalidArgumentError(
    `Invalid time period "${value}". Accepted values: ${TIME_PERIOD_VALUES.join(
      ", "
    )} (or shorthands: ${Object.keys(SHORTHAND_MAP).join(", ")}).`
  );
}
