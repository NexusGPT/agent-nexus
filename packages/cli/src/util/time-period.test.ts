import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";

import {
  parseTimePeriod,
  TIME_PERIOD_VALUES,
  timePeriodHelpFor,
  timePeriodShorthandsFor
} from "./time-period";

/**
 * The help string for the FULL vocabulary this module normalises to.
 *
 * Built here rather than exported as a constant: the flags that render help no
 * longer share one enum, so a module-level string for "the" vocabulary is a
 * value with no caller. `timePeriodHelpFor` takes the set instead.
 */
const FULL_HELP = timePeriodHelpFor(TIME_PERIOD_VALUES);

describe("parseTimePeriod", () => {
  it("maps documented shorthands to the API enum (NEX-2367)", () => {
    expect(parseTimePeriod("7d")).toBe("last_7_days");
    expect(parseTimePeriod("30d")).toBe("last_30_days");
    expect(parseTimePeriod("90d")).toBe("last_90_days");
    expect(parseTimePeriod("24h")).toBe("last_24_hours");
    expect(parseTimePeriod("12mo")).toBe("last_12_months");
    expect(parseTimePeriod("all")).toBe("all_time");
  });

  it("passes through canonical enum values unchanged", () => {
    for (const value of TIME_PERIOD_VALUES) {
      expect(parseTimePeriod(value)).toBe(value);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseTimePeriod("  30D ")).toBe("last_30_days");
    expect(parseTimePeriod("LAST_7_DAYS")).toBe("last_7_days");
  });

  it("throws a helpful error for unknown values", () => {
    expect(() => parseTimePeriod("yesterday")).toThrow(InvalidArgumentError);
    expect(() => parseTimePeriod("yesterday")).toThrow(/Accepted values/);
  });

  it("documents the accepted values in help text", () => {
    for (const value of TIME_PERIOD_VALUES) {
      expect(FULL_HELP).toContain(value);
    }
  });

  it("documents every shorthand it accepts, including the two the old hand-written list dropped", () => {
    // `12m` and `1y` normalise to `last_12_months` and were undocumented while
    // the shorthand half of this string was typed out by hand.
    for (const shorthand of ["24h", "7d", "30d", "90d", "12mo", "12m", "1y", "all"]) {
      expect(parseTimePeriod(shorthand)).toBeTruthy();
      expect(FULL_HELP).toContain(shorthand);
    }
  });
});

describe("timePeriodShorthandsFor", () => {
  /**
   * The three dashboard-backed v1 analytics routes cannot serve `all_time` or
   * `last_24_hours` and their contract no longer offers either. A flag bound to
   * that narrower enum must not advertise the aliases that resolve to them:
   * `enumOption` normalises FIRST and validates the OUTPUT, so `--time-period all`
   * would become `all_time` and be refused one line later, by a flag whose own
   * `--help` had just listed `all` as accepted.
   */
  const DASHBOARD_BACKED = ["last_7_days", "last_30_days", "last_90_days", "last_12_months"];

  it("offers every shorthand for the full vocabulary", () => {
    expect(timePeriodShorthandsFor(TIME_PERIOD_VALUES)).toEqual([
      "24h",
      "7d",
      "30d",
      "90d",
      "12mo",
      "12m",
      "1y",
      "all"
    ]);
  });

  it("drops the aliases whose canonical value is outside the given set", () => {
    expect(timePeriodShorthandsFor(DASHBOARD_BACKED)).toEqual([
      "7d",
      "30d",
      "90d",
      "12mo",
      "12m",
      "1y"
    ]);
  });

  it("returns nothing for a set no alias reaches", () => {
    // The negative control. Without it a function that ignored its argument and
    // returned the full list would satisfy the first case perfectly.
    expect(timePeriodShorthandsFor(["last_180_days"])).toEqual([]);
  });

  it("derives help text that names only the periods it was given", () => {
    const help = timePeriodHelpFor(DASHBOARD_BACKED);
    expect(help).toContain("last_7_days");
    expect(help).not.toContain("all_time");
    expect(help).not.toContain("last_24_hours");
  });
});
