import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";

import { parseTimePeriod, TIME_PERIOD_HELP, TIME_PERIOD_VALUES } from "./time-period";

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
      expect(TIME_PERIOD_HELP).toContain(value);
    }
  });
});
