import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES, exitCategoryFor } from "../../exit-codes";
import { readChannelCommandSource } from "./channel-command-source.testkit";
import {
  applyApprovalVerdictExitCode,
  APPROVAL_REJECTED_EXIT_CATEGORY,
  isApprovalRejected
} from "./template-approval.exit-category";

/**
 * A SENTINEL NO CATEGORY CLAIMS, so "left alone" cannot be confused with "set".
 *
 * `undefined` would not do: the no-clobber arms below have to distinguish an
 * exitCode this module DID NOT TOUCH from one it wrote, and a module that wrote
 * `EXIT_CODES.success` over an inherited status is exactly the regression they
 * exist to catch. A value outside the taxonomy survives only if nothing assigned.
 */
const UNTOUCHED = 77;

afterEach(() => {
  process.exitCode = undefined;
});

describe("a Meta rejection exits outcome-not-reached, from the declared taxonomy", () => {
  it("sets the status a rejection means", () => {
    process.exitCode = undefined;
    applyApprovalVerdictExitCode("rejected");
    expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
  });

  it("is not the generic failure — collapsing the two is the defect being repaired", () => {
    // `create --submit` exited `1` here, which says "the CLI broke" to a script
    // that can only read the number. Meta answering no is not the CLI breaking.
    process.exitCode = undefined;
    applyApprovalVerdictExitCode("rejected");
    expect(process.exitCode).not.toBe(EXIT_CODES.failed);
  });

  it("names a category the taxonomy declares, rather than a number of its own", () => {
    // Joins the constant to `exit-codes.ts` in both directions: the category
    // resolves to a code, and that code resolves back to this category.
    expect({
      category: APPROVAL_REJECTED_EXIT_CATEGORY,
      roundTrips: exitCategoryFor(EXIT_CODES[APPROVAL_REJECTED_EXIT_CATEGORY])
    }).toEqual({
      category: "outcome-not-reached",
      roundTrips: APPROVAL_REJECTED_EXIT_CATEGORY
    });
  });
});

/**
 * EVERY OTHER VERDICT LEAVES `process.exitCode` EXACTLY AS IT WAS.
 *
 * ⚠️ THIS IS NOT IMPLIED BY THE ARMS ABOVE, AND IT IS THE ONE A LATER EDIT
 * BREAKS. A module rewritten to `process.exitCode = EXIT_CODES[rejected ?
 * "outcome-not-reached" : "success"]` passes every rejection arm and reads as
 * more complete, while silently erasing a non-zero status an earlier step in the
 * same action set. One `it` per status, so a status that stops being covered
 * fails by name instead of vanishing into a block that already went red.
 */
describe("no other verdict touches the process status", () => {
  it.each([["approved"], ["pending"], ["unsubmitted"], ["paused"], ["received"], [""]])(
    "%s leaves it untouched",
    (status) => {
      process.exitCode = UNTOUCHED;
      applyApprovalVerdictExitCode(status);
      expect(process.exitCode).toBe(UNTOUCHED);
    }
  );

  it("an absent status leaves it untouched — submit-approval without --wait has no verdict", () => {
    process.exitCode = UNTOUCHED;
    applyApprovalVerdictExitCode(undefined);
    expect(process.exitCode).toBe(UNTOUCHED);
  });
});

describe("the predicate both verbs key off", () => {
  it.each([
    ["rejected", true],
    ["approved", false],
    ["pending", false],
    ["unsubmitted", false],
    ["REJECTED", false],
    ["", false]
  ])("%s -> %s", (status, expected) => {
    expect(isApprovalRejected(status)).toBe(expected);
  });

  it("undefined is not a rejection", () => {
    expect(isApprovalRejected(undefined)).toBe(false);
  });
});

/**
 * BOTH VERBS ROUTE THROUGH THIS MODULE, AND NEITHER RESTATES THE RULE.
 *
 * The defect was one rule written at two sites and written differently. Two
 * calls and no second spelling of the condition is what stops it coming back —
 * a site that grows its own `status === "rejected"` branch, or its own
 * `EXIT_CODES` read, is this file's population leaking back into the caller.
 */
describe("commands/channel.ts states the rule nowhere", () => {
  it("calls the applier twice and re-spells neither the condition nor the map", () => {
    const source = readChannelCommandSource();
    // Anti-vacuity: a wrong path, an empty read or a moved file would make every
    // count below zero, and `restated: false` is TRUE of an empty string.
    expect(source).toContain("renderSubmitApprovalVerdict");

    expect({
      applierCalls: [...source.matchAll(/applyApprovalVerdictExitCode\(/g)].length,
      restatesCondition: source.includes('=== "rejected"'),
      readsTheMapDirectly: source.includes("EXIT_CODES")
    }).toEqual({ applierCalls: 2, restatesCondition: false, readsTheMapDirectly: false });
  });
});
