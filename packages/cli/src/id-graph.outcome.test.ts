import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { CLI_INVALID_ARGUMENTS } from "./errors";
import { EXIT_CATEGORIES, EXIT_CODES } from "./exit-codes";
import { outcomeForExitCode } from "./id-graph.outcome";

/**
 * THE FOUR-OUTCOME CONTRACT, GUARDED IN CI.
 *
 * Every proof of this mapping was previously a fixture run performed by hand —
 * the runner ends in `main()`, so nothing in the suite could reach it. These
 * assertions are the standing replacement for somebody remembering.
 *
 * 🚨 THE POPULATION IS THE WHOLE TAXONOMY, not a list of interesting codes.
 * `EXIT_CATEGORIES` is `exit-codes.ts`'s own export, so a category added there
 * arrives here automatically and has to be classified rather than defaulting
 * into silence. That is the difference between covering the contract and
 * covering the cases somebody thought of.
 */

/** Exactly what `emitDocument` writes: two-space indent, multi-line. */
const document = (code: string): string =>
  JSON.stringify({ error: { message: "refused", hint: null, code } }, null, 2);

/** A document as the runner sees it — stdout and stderr concatenated. */
const noisy = (code: string): string =>
  `warning: unrelated stream noise\n${document(code)}\ntrailing line\n`;

describe("the outcome of a non-zero exit", () => {
  /**
   * The ONE case that is not a failure. `invalid-input` reached through
   * `refuse()` means nothing was sent, so the route was never exercised.
   */
  it("skips a client-side refusal", () => {
    const verdict = outcomeForExitCode(EXIT_CODES["invalid-input"], noisy(CLI_INVALID_ARGUMENTS));
    expect(verdict.status).toBe("SKIPPED_NEEDS_INPUT");
  });

  it("FAILS the same exit code when the server rejected a complete request", () => {
    // 400/409/422 share `invalid-input` with the refusal above and mean the
    // opposite. Getting this wrong records a broken route as a skip and lets
    // the run exit 0 — the defect this whole harness exists to refuse.
    const verdict = outcomeForExitCode(EXIT_CODES["invalid-input"], noisy("VALIDATION_ERROR"));
    expect(verdict.status).toBe("FAILED");
  });

  /**
   * EVERY OTHER CATEGORY IS A FAILURE, driven over the taxonomy's own export so
   * a new category cannot land unclassified.
   *
   * `eachOrRefuse` is correct here: this population is DERIVED from
   * `EXIT_CATEGORIES`, so an empty table means that export broke — the case the
   * wrapper exists to refuse. (A DECLARED ledger would take an offender array
   * instead, because there an empty table is the success state.)
   */
  const otherCategories = EXIT_CATEGORIES.filter(
    (category) => category !== "success" && category !== "invalid-input"
  ).map((category) => ({ category, code: EXIT_CODES[category] }));

  it.each(
    eachOrRefuse(otherCategories, "every exit category that is not success or invalid-input")
  )("$category is a FAILURE", ({ code }) => {
    expect(outcomeForExitCode(code, noisy("ANY_CODE")).status).toBe("FAILED");
  });

  it("FAILS a category that is not invalid-input even carrying the refusal code", () => {
    // The category gates the skip. A document stamped CLI_INVALID_ARGUMENTS
    // arriving on a `remote-error` exit is not a client-side refusal, and
    // reading the document alone would call it one.
    const verdict = outcomeForExitCode(EXIT_CODES["remote-error"], noisy(CLI_INVALID_ARGUMENTS));
    expect(verdict.status).toBe("FAILED");
  });

  it("FAILS an undeclared exit code", () => {
    // Not in the taxonomy at all — no category, so nothing can justify a skip.
    expect(outcomeForExitCode(99, noisy(CLI_INVALID_ARGUMENTS)).status).toBe("FAILED");
  });

  describe("the note", () => {
    it("names the code and the category on a failure", () => {
      const verdict = outcomeForExitCode(EXIT_CODES["remote-error"], "boom");
      expect(verdict.note).toContain(String(EXIT_CODES["remote-error"]));
      expect(verdict.note).toContain("remote-error");
    });

    it("says the refusal happened before anything was sent, on a skip", () => {
      const verdict = outcomeForExitCode(
        EXIT_CODES["invalid-input"],
        document(CLI_INVALID_ARGUMENTS)
      );
      expect(verdict.note).toContain("before sending anything");
    });

    it("truncates, so an unbounded body cannot reach the report", () => {
      const verdict = outcomeForExitCode(EXIT_CODES.failed, "x".repeat(5000));
      expect(verdict.note.length).toBeLessThan(200);
    });
  });
});
