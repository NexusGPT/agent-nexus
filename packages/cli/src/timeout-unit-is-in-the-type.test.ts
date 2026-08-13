import { describe, expect, it } from "vitest";

import { createClient, MAX_TIMEOUT_SECONDS, parseTimeoutSeconds, seconds } from "./client";

/**
 * NEX-3707, the class rather than the instance.
 *
 * The defect that reached production was a NUMBER crossing a boundary with no
 * unit in its type: `PROMPT_ASSISTANT_TIMEOUT_MS` handed to a parameter meaning
 * seconds, multiplied by 1000 a second time, overflowing Node's 32-bit timer.
 * Nothing typechecked it, because both units were `number`.
 *
 * `createClient`'s timeout is now `Seconds`, a branded type with one way in.
 * These cases pin the four shapes that matter, and the `@ts-expect-error` ones
 * are the real gate: they are checked by `tsc`, not by vitest, and an
 * expect-error that stops erroring FAILS THE BUILD. So if the brand is ever
 * widened back to `number`, this file goes red rather than silently passing.
 *
 * A source gate for the same class already exists
 * (`commands/timeout-values-carry-their-unit.test.ts`) and stays: it catches
 * the `*_MS` NAME even where a brand would be satisfied, and it enforces that
 * a command default still reads `globals.timeout`. The type catches what a
 * name cannot — an unnamed literal — and it fires in the editor rather than
 * in CI. They overlap deliberately and neither subsumes the other.
 */

/** A plain millisecond number, exactly as the defect spelled it. */
const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

describe("a millisecond number cannot reach the seconds boundary", () => {
  it("refuses a bare millisecond constant", () => {
    // @ts-expect-error — `number` is not `Seconds`. This is the shipped defect.
    const rejected = () => createClient({ timeout: TWO_HOURS_IN_MS });
    expect(typeof rejected).toBe("function");
  });

  it("refuses an unnamed millisecond literal, which no name-based rule can see", () => {
    // @ts-expect-error — the brand does not care what the value is called.
    const rejected = () => createClient({ timeout: 7_200_000 });
    expect(typeof rejected).toBe("function");
  });

  it("accepts a value that states its unit", () => {
    const accepted = () => createClient({ timeout: seconds(7200) });
    expect(typeof accepted).toBe("function");
  });

  it("accepts the parsed --timeout flag, which is seconds by definition", () => {
    const parsed = parseTimeoutSeconds("120");
    const accepted = () => createClient({ timeout: parsed });
    expect(parsed).toBe(120);
    expect(typeof accepted).toBe("function");
  });
});

describe("seconds() is a statement about the unit, not a validator", () => {
  it("returns the number it was given", () => {
    expect(seconds(7200)).toBe(7200);
  });

  it("leaves the range refusal to the one place the unit changes", () => {
    // Minting is free; the ceiling belongs to `timeoutSecondsToMs` so two
    // ceilings cannot drift apart.
    expect(seconds(MAX_TIMEOUT_SECONDS + 1)).toBe(MAX_TIMEOUT_SECONDS + 1);
  });
});
