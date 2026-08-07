import { describe, expect, it } from "vitest";

import { parseLogInstant, resolveLogWindow, VIBE_LOG_MAX_RANGE_MS } from "./log-window";

/** A fixed instant, so every expectation below is arithmetic rather than a clock read. */
const NOW = Date.parse("2026-08-06T12:00:00.000Z");

describe("parseLogInstant", () => {
  it("reads each duration unit as a distance back from now", () => {
    // Asserted against LITERALS, not against the module's own unit table. A test
    // that multiplied by the same constant the code multiplies by would agree
    // with itself whatever that constant became.
    expect(parseLogInstant("45s", NOW, "--since")).toBe(NOW - 45_000);
    expect(parseLogInstant("30m", NOW, "--since")).toBe(NOW - 1_800_000);
    expect(parseLogInstant("1h", NOW, "--since")).toBe(NOW - 3_600_000);
    expect(parseLogInstant("2d", NOW, "--since")).toBe(NOW - 172_800_000);
  });

  it("reads an ISO-8601 instant as itself", () => {
    expect(parseLogInstant("2026-08-06T09:30:00.000Z", NOW, "--since")).toBe(
      Date.parse("2026-08-06T09:30:00.000Z")
    );
  });

  it("refuses a bare year, which Date.parse would happily accept", () => {
    // The trap this shape exists to close: `Date.parse("2026")` is a valid date,
    // so a fallback that tried Date.parse on everything would resolve a typo to
    // a window in the distant past instead of refusing it.
    expect(() => parseLogInstant("2026", NOW, "--since")).toThrow(/neither a duration/);
  });

  it("refuses a compound duration rather than reading half of it", () => {
    expect(() => parseLogInstant("1h30m", NOW, "--since")).toThrow(/neither a duration/);
  });

  it("names the flag the caller typed", () => {
    expect(() => parseLogInstant("nonsense", NOW, "--until")).toThrow(/^--until:/);
  });
});

describe("resolveLogWindow", () => {
  it("ends at now when --until is absent", () => {
    expect(resolveLogWindow("1h", undefined, NOW)).toEqual({ from: NOW - 3_600_000, to: NOW });
  });

  it("refuses an inverted window", () => {
    expect(() =>
      resolveLogWindow("2026-08-06T13:00:00.000Z", "2026-08-06T11:00:00.000Z", NOW)
    ).toThrow(/strictly before/);
  });

  it("refuses a zero-width window", () => {
    const instant = "2026-08-06T11:00:00.000Z";
    expect(() => resolveLogWindow(instant, instant, NOW)).toThrow(/strictly before/);
  });

  it("accepts a window of exactly the ceiling, and refuses one millisecond more", () => {
    // The server's own bound is `to - from <= MAX_RANGE_MS`. A stricter local
    // `<` would refuse a request the server accepts, which is the one direction
    // a client-side bound must never take — so the boundary value itself is
    // asserted rather than an obviously-wrong one.
    expect(resolveLogWindow("7d", undefined, NOW)).toEqual({
      from: NOW - VIBE_LOG_MAX_RANGE_MS,
      to: NOW
    });
    const oneMsTooEarly = new Date(NOW - VIBE_LOG_MAX_RANGE_MS - 1).toISOString();
    expect(() => resolveLogWindow(oneMsTooEarly, undefined, NOW)).toThrow(/must not exceed 7 days/);
  });

  it("holds the ceiling at seven days", () => {
    // A LITERAL, so a change to the constant fails here instead of moving the
    // expectation along with it.
    expect(VIBE_LOG_MAX_RANGE_MS).toBe(604_800_000);
  });
});
