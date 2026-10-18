import { describe, expect, it } from "vitest";

import {
  EXIT_CATEGORIES,
  EXIT_CODES,
  type ExitCategory,
  exitCategoryFor,
  exitCodeTaxonomyViolations
} from "./exit-codes";

/**
 * EVERY EXIT CODE THE CLI CAN PRODUCE IS A MEMBER OF THE DECLARED TAXONOMY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS A NAMED OBLIGATION SET, NEVER A COUNT FLOOR, AND THE DIFFERENCE IS
 *    THE WHOLE GATE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A gate spelled "at least N categories are covered" has a hole exactly the
 * shape of the defect it is meant to catch: rename or delete a category and the
 * item simply LEAVES the population, taking its own case with it. The count
 * drops by one, the floor is lowered by whoever sees the red, and the surviving
 * cases all still pass. Measured on a sibling gate in this package: 11 cases
 * became 10, every one green.
 *
 * So {@link REQUIRED_CATEGORIES} is an explicit list of NAMES, asserted equal to
 * the taxonomy's own key set in BOTH directions. Deleting a category fails here
 * by name. Adding one fails here by name too, which is correct — a new exit
 * category is a change to the CLI's public contract and must be a deliberate
 * edit to this file, not a silent widening.

 */
const REQUIRED_CATEGORIES: readonly ExitCategory[] = [
  "success",
  "failed",
  "not-authenticated",
  "permission-denied",
  "not-found",
  "invalid-input",
  "remote-error",
  "connection-failed",
  "timed-out",
  "local-failed",
  "outcome-not-reached",
  "unmeasured",
  "interrupted"
];

describe("the exit-code taxonomy is declared once and is internally sound", () => {
  it("declares a non-empty set of categories", () => {
    // The guard against every assertion below being vacuously true.
    expect(EXIT_CATEGORIES.length).toBeGreaterThan(0);
    expect(REQUIRED_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("covers every REQUIRED category by name — a deletion fails here", () => {
    const missing = REQUIRED_CATEGORIES.filter((name) => !(name in EXIT_CODES));
    expect(missing).toEqual([]);
  });

  it("declares no category the obligation set does not name — an addition fails here", () => {
    const unlisted = EXIT_CATEGORIES.filter((name) => !REQUIRED_CATEGORIES.includes(name));
    expect(unlisted).toEqual([]);
  });

  it("has no structural violation — duplicates, out-of-range, or a stolen shell code", () => {
    expect(exitCodeTaxonomyViolations()).toEqual([]);
  });

  it("keeps 0 and 1 where every shell expects them", () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.failed).toBe(1);
  });

  it("reserves 130 for SIGINT and never reassigns it", () => {
    // 128 + 2. Declared so that nothing else in the CLI can claim the number,
    // not because the CLI chose it.
    expect(EXIT_CODES.interrupted).toBe(128 + 2);
    expect(exitCategoryFor(130)).toBe("interrupted");
  });

  it("claims nothing else in the shell's own band", () => {
    const trespassers = EXIT_CATEGORIES.filter(
      (name) => EXIT_CODES[name] >= 126 && name !== "interrupted"
    );
    expect(trespassers).toEqual([]);
  });
});
