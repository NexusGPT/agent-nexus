import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import type { WhyNotReadyReport } from "./track-blockers";
import { emptyHoldLine, renderWhyNotReady } from "./track-blockers.render";

/**
 * `why-not-ready` MUST NOT CLAIM A NEGATIVE ITS WALK COULD NOT ESTABLISH.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * With no hold rows, the command printed "Nothing is being withheld by a
 * dependency." flatly. That claim rests on the ancestry walk, and `buildAncestry`
 * BREAKS out of a chain that revisits a node — so on a looped plan the walk stops
 * early and the hold table is short for a reason that is not "there are no
 * holds". An incomplete ancestor list can only MISS a hold, never invent one, so
 * the two states render identically and only `ancestryLooped` separates them.
 *
 * ⚠️ THE EXISTING LOOP WARNING DOES NOT COVER THIS, WHILE READING AS THOUGH IT
 * DOES. It says "Some rows below may be explained against an incomplete ancestor
 * list" — and this is the branch with no rows below. It qualified every case
 * except the one carrying the strongest claim.
 *
 * ── WHY BOTH THE STRING AND THE WIRING ARE ASSERTED ─────────────────────────
 *
 * They fail on opposite mutations and neither covers the other. A correct
 * `emptyHoldLine` that `renderWhyNotReady` never calls leaves the shipped
 * command exactly as broken as before, and the unit assertions all stay green.
 * A wiring test alone goes green over wording that still over-claims.
 */

const LOOPED_MARKER = "The ancestry walk stopped early.";
/** The claim the command is not entitled to make on a truncated walk. */
const OVERCLAIM = "Nothing is being withheld by a dependency.";

const reportWith = (ancestryLooped: boolean): WhyNotReadyReport => ({
  unready: [],
  reconstructedReadyIds: [],
  disagreesWithServer: false,
  ancestryLooped
});

const captured: string[] = [];
const capture = (): void => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  captured.length = 0;
  setJsonMode(false);
});

describe("the empty-hold line is conditional on the walk finishing", () => {
  it("CONTROL: the line discriminates on ancestryLooped at all", () => {
    // A function returning one constant would satisfy several assertions below.
    // This fails first if the parameter stops being read.
    expect(emptyHoldLine(true, true)).not.toBe(emptyHoldLine(false, true));
  });

  it("CONTROL: it also discriminates on the ready set", () => {
    expect(emptyHoldLine(false, true)).not.toBe(emptyHoldLine(false, false));
  });

  // ── the walk finished: the original claim is untouched ────────────────────

  it.each([
    [true, "No open work leaf is held by an edge. Nothing is being withheld by a dependency."],
    [false, "Nothing is held by an edge — the ready set is not empty."]
  ])(
    "an unlooped walk with readySetIsEmpty=%s keeps its original sentence verbatim",
    (readySetIsEmpty, expected) => {
      // Byte-for-byte. The defect was the MISSING condition, not the wording of
      // the case that was always entitled to its claim.
      expect(emptyHoldLine(false, readySetIsEmpty as boolean)).toBe(expected);
    }
  );

  // ── the walk stopped early: no universal negative ─────────────────────────

  it.each([[true], [false]])(
    "a looped walk with readySetIsEmpty=%s never claims nothing is withheld",
    (readySetIsEmpty) => {
      expect(emptyHoldLine(true, readySetIsEmpty)).not.toContain(OVERCLAIM);
    }
  );

  it.each([[true], [false]])(
    "a looped walk with readySetIsEmpty=%s says the walk stopped early",
    (readySetIsEmpty) => {
      const line = emptyHoldLine(true, readySetIsEmpty);

      expect({
        marker: line.includes(LOOPED_MARKER),
        incomplete: line.includes("can be incomplete")
      }).toEqual({ marker: true, incomplete: true });
    }
  );

  it("a looped walk reports what the report SHOWS, not what exists", () => {
    // The distinction the whole fix rests on: a statement about this report's
    // contents is establishable; a statement about the plan is not.
    expect(emptyHoldLine(true, true)).toContain(
      "This report shows no work leaf that an edge holds."
    );
  });

  it("a looped walk still reports a non-empty ready set, which IS established", () => {
    // Truncation is a reason to drop the unprovable claim, never a reason to
    // drop a fact the command genuinely has.
    expect(emptyHoldLine(true, false)).toContain("The ready set is not empty.");
  });

  // ── the wiring ────────────────────────────────────────────────────────────

  it("renderWhyNotReady actually prints the truncated line, not just returns it", () => {
    setJsonMode(false);
    capture();
    renderWhyNotReady(reportWith(true), []);
    const out = captured.join("\n");

    expect({ says: out.includes(LOOPED_MARKER), overclaims: out.includes(OVERCLAIM) }).toEqual({
      says: true,
      overclaims: false
    });
  });

  it("CONTROL: renderWhyNotReady still prints the original claim when the walk finished", () => {
    // Without this, a rendering that printed the truncated line unconditionally
    // would satisfy the assertion above while breaking every healthy board.
    setJsonMode(false);
    capture();
    renderWhyNotReady(reportWith(false), []);
    const out = captured.join("\n");

    expect({ overclaims: out.includes(OVERCLAIM), says: out.includes(LOOPED_MARKER) }).toEqual({
      overclaims: true,
      says: false
    });
  });
});
