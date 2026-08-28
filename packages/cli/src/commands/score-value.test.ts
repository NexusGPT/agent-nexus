import { describe, expect, it } from "vitest";

import { parseMetadata, renderScoreValue, resolveScoreValue } from "./score-value";

/**
 * THE VALUE/VALUETYPE INVARIANT, refused locally rather than by the server.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THESE ASSERTIONS ASSERT ON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `resolveScoreValue`, `renderScoreValue` and `parseMetadata` are pure functions
 * over strings. There is no double anywhere in this file, nothing asynchronous,
 * and no client — so nothing here can assert on a mock of its own subject, and
 * no `await` can fail to run.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * A score carries exactly one value shape, mirroring the database's
 * `Score_value_matches_type_chk` constraint. The cheap version of this check
 * reads whichever value flag is present and trusts `--value-type` to agree. It
 * fails toward a SILENT WRONG WRITE: `--value-type NUMERIC --categorical-value
 * high` would either send a row the column rejects with a Zod path nobody can
 * read, or — worse, if a later refactor made the fields optional — record a
 * NUMERIC score with no number in it.
 *
 * ── THE CASE THAT IS EASY TO MISS ───────────────────────────────────────────
 *
 * `Number("")` is `0`, not `NaN`. So an empty `--numeric-value` passes a naive
 * `Number.isFinite` guard and records a REAL SCORE OF ZERO — a plausible value,
 * silently invented from an empty flag. That is the one case here whose failure
 * is invisible downstream, so it has its own case rather than riding along in a
 * table.
 */

const BASE = { valueType: "NUMERIC", numericValue: "0.82" } as const;

describe("resolveScoreValue accepts exactly one legal pairing", () => {
  it.each([
    [
      "NUMERIC",
      { valueType: "NUMERIC", numericValue: "0.82" },
      { valueType: "NUMERIC", numericValue: 0.82 }
    ],
    [
      "CATEGORICAL",
      { valueType: "CATEGORICAL", categoricalValue: "high" },
      { valueType: "CATEGORICAL", categoricalValue: "high" }
    ],
    [
      "BOOLEAN true",
      { valueType: "BOOLEAN", booleanValue: true },
      { valueType: "BOOLEAN", booleanValue: true }
    ],
    [
      "BOOLEAN false",
      { valueType: "BOOLEAN", booleanValue: false },
      { valueType: "BOOLEAN", booleanValue: false }
    ]
  ])("%s resolves to its discriminated shape", (_label, opts, expected) => {
    // The positive controls. Without them a resolver that threw unconditionally
    // would pass every refusal case below.
    expect(resolveScoreValue(opts)).toEqual(expected);
  });

  it("parses the numeric value as a NUMBER, not a string", () => {
    // `toEqual` would pass on "0.82" if the resolver forgot to convert, because
    // it is comparing against a fresh object either way. The type is the claim.
    const resolved = resolveScoreValue(BASE);
    expect(resolved.valueType === "NUMERIC" ? typeof resolved.numericValue : "not-numeric").toBe(
      "number"
    );
  });
});

describe("resolveScoreValue refuses what the column would reject", () => {
  it.each([
    [
      "a value flag that does not match the discriminant",
      { valueType: "NUMERIC", categoricalValue: "high" },
      /requires --numeric-value/
    ],
    [
      "the discriminant with no value flag at all",
      { valueType: "CATEGORICAL" },
      /requires --categorical-value/
    ],
    [
      "two value flags at once",
      { valueType: "NUMERIC", numericValue: "1", booleanValue: true },
      /exactly one value flag/
    ],
    [
      "an unknown discriminant",
      { valueType: "PERCENTILE", numericValue: "1" },
      /must be NUMERIC, CATEGORICAL or BOOLEAN/
    ],
    [
      "a non-numeric numeric value",
      { valueType: "NUMERIC", numericValue: "high" },
      /finite number/
    ],
    [
      "an empty categorical value",
      { valueType: "CATEGORICAL", categoricalValue: "" },
      /must not be empty/
    ],
    [
      "a boolean value that arrived as a STRING, meaning the flag lost its parser",
      { valueType: "BOOLEAN", booleanValue: "yes" },
      /lost its argParser/
    ]
  ])("refuses %s", (_label, opts, message) => {
    expect(() => resolveScoreValue(opts)).toThrow(message);
  });

  it("refuses an EMPTY --numeric-value, which Number() would silently make 0", () => {
    // The case the naive guard misses. `Number("")` is 0 and `Number.isFinite(0)`
    // is true, so without the explicit blank check this records a real score of
    // zero from a flag the user left empty — a plausible number nobody typed.
    expect(() => resolveScoreValue({ valueType: "NUMERIC", numericValue: "" })).toThrow(
      /finite number/
    );
    // And the control: a real zero must still be accepted, or the fix above
    // would have made zero unrecordable.
    expect(resolveScoreValue({ valueType: "NUMERIC", numericValue: "0" })).toEqual({
      valueType: "NUMERIC",
      numericValue: 0
    });
  });

  it("refuses whitespace-only --numeric-value for the same reason", () => {
    expect(() => resolveScoreValue({ valueType: "NUMERIC", numericValue: "   " })).toThrow(
      /finite number/
    );
  });
});

describe("renderScoreValue", () => {
  it.each([
    [{ valueType: "NUMERIC", numericValue: 0.82 }, "0.82"],
    [{ valueType: "CATEGORICAL", categoricalValue: "high" }, "high"],
    [{ valueType: "BOOLEAN", booleanValue: false }, "false"]
  ])("renders %o as %s", (score, expected) => {
    expect(renderScoreValue(score)).toBe(expected);
  });

  it("NAMES an unknown valueType rather than printing undefined", () => {
    // A blank cell reads as a score with no value. This reads as a CLI that has
    // not been taught a contract the server has already started sending — which
    // is the true statement, and the actionable one.
    expect(renderScoreValue({ valueType: "PERCENTILE" })).toBe("(unknown valueType PERCENTILE)");
  });

  it("renders a BOOLEAN false rather than falling through to the unknown branch", () => {
    // `false` is falsy, so a resolver written with `??` or `||` would skip it.
    // The case above covers `false` already; this states why it is there.
    expect(renderScoreValue({ valueType: "BOOLEAN", booleanValue: false })).not.toContain(
      "unknown"
    );
  });
});

describe("parseMetadata", () => {
  it("parses a JSON object into a value, not a string", () => {
    expect(parseMetadata('{"source":"bridge"}')).toEqual({ source: "bridge" });
  });

  it("refuses text that is not JSON", () => {
    // Passing it through as a string would store a quoted blob that reads back
    // as text and never as an object — a corruption nothing downstream reports.
    expect(() => parseMetadata("source=bridge")).toThrow(/must be valid JSON/);
  });
});
