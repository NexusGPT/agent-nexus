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
 * The shorthand spellings, as a list.
 *
 * Exported so a `--time-period` flag can offer them as `.choices()` alongside
 * the canonical values instead of retyping them. A flag that normalises a
 * spelling it does not advertise is a flag whose help is wrong.
 */
export const TIME_PERIOD_SHORTHANDS = Object.keys(SHORTHAND_MAP) as readonly string[];

const VALID_ENUM = new Set<string>(TIME_PERIOD_VALUES);

/**
 * Human-readable summary of every accepted value, for `--help` text.
 */
export const TIME_PERIOD_HELP = `Time period: ${TIME_PERIOD_VALUES.join(
  ", "
)} (shorthands: 24h, 7d, 30d, 90d, 12mo, all)`;

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
