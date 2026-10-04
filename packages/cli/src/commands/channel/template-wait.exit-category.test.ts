import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES, exitCategoryFor } from "../../exit-codes";
import { readChannelCommandSource } from "./channel-command-source.testkit";
import { waitDocumentFields } from "./template-wait.document-fields";
import { applyWaitExitCode, WAIT_TIMED_OUT_EXIT_CATEGORY } from "./template-wait.exit-category";

/**
 * A SENTINEL NO CATEGORY CLAIMS, so "left alone" cannot be confused with "set".
 *
 * Same value and same reason as `template-approval.exit-category.test.ts`: a
 * module that wrote `EXIT_CODES.success` over an inherited status would pass
 * every positive arm, and only a value outside the taxonomy can tell an
 * untouched status from one this module assigned.
 */
const UNTOUCHED = 77;

/** Every combination of the two booleans a caller holds. Four, and all reachable. */
const EVERY_COMBINATION = [
  { waited: false, settled: false },
  { waited: false, settled: true },
  { waited: true, settled: false },
  { waited: true, settled: true }
] as const;

afterEach(() => {
  process.exitCode = undefined;
});

describe("a spent --wait budget exits timed-out, from the declared taxonomy", () => {
  it("sets the status a timeout means", () => {
    process.exitCode = undefined;
    applyWaitExitCode({ waited: true, settled: false });
    expect(process.exitCode).toBe(EXIT_CODES["timed-out"]);
  });

  it("is not success — reporting a check that ran and PASSED is the defect repaired", () => {
    // Both `--wait` verbs exited 0 here. COMPATIBILITY.md forbids reporting a
    // check that could not run as one that ran and FAILED; 0 is worse than that.
    process.exitCode = undefined;
    applyWaitExitCode({ waited: true, settled: false });
    expect(process.exitCode).not.toBe(EXIT_CODES.success);
  });

  it("is not the settled-verdict category — a timeout decided nothing", () => {
    // `outcome-not-reached` is what a Meta rejection and a failed delivery exit.
    // Collapsing a timeout into it would put "nobody answered" and "the answer
    // was no" back on one number, one layer down from the defect being fixed.
    process.exitCode = undefined;
    applyWaitExitCode({ waited: true, settled: false });
    expect(process.exitCode).not.toBe(EXIT_CODES["outcome-not-reached"]);
  });

  it("names a category the taxonomy declares, rather than a number of its own", () => {
    expect({
      category: WAIT_TIMED_OUT_EXIT_CATEGORY,
      roundTrips: exitCategoryFor(EXIT_CODES[WAIT_TIMED_OUT_EXIT_CATEGORY])
    }).toEqual({ category: "timed-out", roundTrips: WAIT_TIMED_OUT_EXIT_CATEGORY });
  });
});

/**
 * EVERY OTHER WAIT LEAVES `process.exitCode` EXACTLY AS IT WAS.
 *
 * ⚠️ THE `settled: true` CASE IS THE ONE A LATER EDIT BREAKS, and it is not
 * implied by the arms above. Both call sites run this applier IMMEDIATELY AFTER
 * the verdict applier, so a module rewritten to assign on both branches would
 * erase a Meta rejection or a failed delivery that had just been recorded —
 * turning the change that made those visible back into an exit 0.
 */
describe("no other wait touches the process status", () => {
  it("a resolved wait leaves an inherited non-zero status alone", () => {
    process.exitCode = UNTOUCHED;
    applyWaitExitCode({ waited: true, settled: true });
    expect(process.exitCode).toBe(UNTOUCHED);
  });

  it("a wait that never ran leaves it alone even though nothing settled", () => {
    // `waited: false, settled: false` is the shape of a verb invoked WITHOUT
    // --wait. Keying on `!settled` alone would exit 8 on every plain invocation.
    process.exitCode = UNTOUCHED;
    applyWaitExitCode({ waited: false, settled: false });
    expect(process.exitCode).toBe(UNTOUCHED);
  });

  it("a wait that never ran leaves it alone when settled is true as well", () => {
    process.exitCode = UNTOUCHED;
    applyWaitExitCode({ waited: false, settled: true });
    expect(process.exitCode).toBe(UNTOUCHED);
  });
});

/**
 * THE NUMBER AND THE `--json` DOCUMENT CANNOT DISAGREE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A PROCESS EXITING `8` BESIDE A RECORD READING `"wait": "resolved"` IS THE
 * COLLAPSE THIS RULE CLOSES, WEARING THE CURE'S CLOTHES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both are derived from the same {@link WaitFacts}, in two files, by two
 * expressions — `waited && !settled` here, a three-way ternary there. That they
 * agree today is a convention; this arm is what stops either moving alone. It
 * imports the REAL `waitDocumentFields` rather than restating its rule, so a
 * change to the ternary reds here rather than shipping a document that
 * contradicts the exit code.
 */
describe("the exit code agrees with the wait key the document publishes", () => {
  it.each(EVERY_COMBINATION)("waited=$waited settled=$settled", (facts) => {
    process.exitCode = undefined;
    applyWaitExitCode(facts);

    const exited = process.exitCode === EXIT_CODES["timed-out"];
    expect({ exited, wait: waitDocumentFields(facts).wait }).toEqual({
      exited: waitDocumentFields(facts).wait === "timed-out",
      wait: waitDocumentFields(facts).wait
    });
  });

  it("covers a document state that is actually reachable — not a vacuous sweep", () => {
    // Anti-vacuity: the table above is only worth anything if the document can
    // produce more than one value over it. A `wait` stuck on one string would
    // make every case above agree trivially.
    expect([...new Set(EVERY_COMBINATION.map((f) => waitDocumentFields(f).wait))].sort()).toEqual([
      "not-requested",
      "resolved",
      "timed-out"
    ]);
  });
});

/**
 * BOTH `--wait` VERBS ROUTE THROUGH THIS MODULE, AND NEITHER RESTATES THE RULE.
 *
 * `create --submit` deliberately does NOT: its poll is unconditional, so its
 * timeout is not a caller missing a verdict it asked for. Two calls and not
 * three is therefore a claim about scope, not an accident of counting.
 */
describe("commands/channel.ts states the timeout rule nowhere", () => {
  it("calls the applier twice and re-spells neither the condition nor the map", () => {
    const source = readChannelCommandSource();
    // Anti-vacuity: a wrong path or a moved file makes every count below zero,
    // and `restates: false` is TRUE of an empty string.
    expect(source).toContain("renderDeliveryOutcome");

    expect({
      applierCalls: [...source.matchAll(/applyWaitExitCode\(/g)].length,
      restatesTheCategory: source.includes('"timed-out"'),
      readsTheMapDirectly: source.includes("EXIT_CODES")
    }).toEqual({ applierCalls: 2, restatesTheCategory: false, readsTheMapDirectly: false });
  });
});
