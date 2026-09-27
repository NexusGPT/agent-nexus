import { describe, expect, it } from "vitest";

import {
  classifyApprovalStatus,
  isApprovalTerminal,
  readApprovalVerdict
} from "./template-approval.read-verdict";

/**
 * One property per `it`, for the reason `poll-for-terminal-state.test.ts` states
 * next door: a failing assertion throws and aborts the rest of its own block, so
 * two arms in one block means a mutant scores whichever is written first and the
 * other is unscored while the block still reads red.
 *
 * Every arm here was scored by breaking the classifier and watching it fail; the
 * mutant is named beside each one.
 */

/**
 * Twilio's five, written out here rather than imported.
 *
 * Importing the module's own arrays would make the completeness arm below a
 * tautology — it would compare the source with itself. This list is copied from
 * `apps/backend/src/external/twilio/admin/templates/twilio-template-approvals.api.ts`
 * ("unsubmitted | received | pending | approved | rejected"), which is where the
 * vocabulary is documented and is not a file this package can drift alongside.
 */
const TWILIO_DOCUMENTED_STATUSES = [
  "unsubmitted",
  "received",
  "pending",
  "approved",
  "rejected"
] as const;

const approvalRow = (status: string) => [
  { sid: "HX_OTHER", approvalRequests: { status: "pending" } },
  { sid: "HX_ME", approvalRequests: { status } }
];

describe("classifyApprovalStatus — the three dispositions", () => {
  it("reads 'received' as AWAITING, which is what retired the wide predicate", () => {
    // `received` is the whole argument for this file: Twilio documents it, the
    // console buckets it with `pending` as `awaitingMeta`, and it is neither
    // `pending` nor `unsubmitted` — so the old `submit-approval` spelling called
    // it a verdict.
    //
    // MUTANT: drop "received" from AWAITING_STATUSES -> it falls through to
    // `unrecognised` and this arm reds.
    expect(classifyApprovalStatus("received")).toBe("awaiting");
  });

  it("names a status outside the vocabulary UNRECOGNISED rather than bucketing it", () => {
    // MUTANT: make the final `return` "awaiting" or "settled" -> an unknown
    // status silently joins a bucket it was never classified into.
    expect(classifyApprovalStatus("paused")).toBe("unrecognised");
  });

  it("recognises every status Twilio documents", () => {
    // The completeness arm. The list above is copied from the backend's own
    // docblock, so dropping any status from either array here reds it.
    //
    // MUTANT: remove "unsubmitted" from AWAITING_STATUSES -> ["unsubmitted"].
    const unrecognised = TWILIO_DOCUMENTED_STATUSES.filter(
      (status) => classifyApprovalStatus(status) === "unrecognised"
    );
    expect(unrecognised).toEqual([]);
  });

  it("is case-SENSITIVE on purpose, so a mixed-case status is unrecognised", () => {
    // Deliberate, and the opposite of what the backend mapper does. Recognising
    // "Rejected" as settled here would route it past
    // `template-create.verdict.render.ts`'s `status === "rejected"` branch and
    // print "Template approved by Meta" over a rejection.
    //
    // MUTANT: lower-case the input in classifyApprovalStatus -> "settled".
    expect(classifyApprovalStatus("Rejected")).toBe("unrecognised");
  });
});

describe("isApprovalTerminal — the one predicate both approval polls run on", () => {
  it("keeps polling on 'received'", () => {
    // MUTANT: `!== "awaiting"` in isApprovalTerminal -> true, and
    // `submit-approval --wait` is back to announcing a resolution it did not get.
    expect(isApprovalTerminal("received")).toBe(false);
  });

  it("keeps polling on an unrecognised status rather than calling it a verdict", () => {
    // The mapping decision this predicate exists to make, and the only one it
    // makes. `decided` / `observedTerminal` both promise a status was SEEN and
    // understood; neither is true here.
    //
    // MUTANT: `classify(...) !== "awaiting"` -> true, and `create --submit`
    // renders any unknown settled-looking status as "Template approved by Meta".
    expect(isApprovalTerminal("paused")).toBe(false);
  });

  it("admits exactly ONE status that is terminal and not 'rejected'", () => {
    // `template-create.verdict.render.ts` prints "Template approved by Meta" for
    // every decided status that is not the literal "rejected". That line is
    // honest only while `approved` is the sole status able to reach it, so the
    // invariant belongs to this predicate rather than to the renderer.
    //
    // MUTANT: add any status to SETTLED_STATUSES -> ["approved", <that one>].
    const reachesTheApprovedLine = [...TWILIO_DOCUMENTED_STATUSES, "paused", "Approved"].filter(
      (status) => isApprovalTerminal(status) && status !== "rejected"
    );
    expect(reachesTheApprovedLine).toEqual(["approved"]);
  });
});

describe("readApprovalVerdict — what the poll carries out", () => {
  it("marks a 'received' row non-terminal", () => {
    // MUTANT: `terminal: true` -> the poll stops on a wait state.
    expect(readApprovalVerdict(approvalRow("received"), "HX_ME")?.terminal).toBe(false);
  });

  it("carries the UNRECOGNISED disposition out, so a caller can tell it from waiting", () => {
    // `terminal: false` collapses "awaiting" and "unrecognised" into one flag.
    // This field is the only thing that separates "still pending, check later"
    // from "Meta reports a status this CLI does not know".
    //
    // MUTANT: drop `disposition` from the returned value -> undefined.
    expect(readApprovalVerdict(approvalRow("paused"), "HX_ME")?.value.disposition).toBe(
      "unrecognised"
    );
  });

  it("still reports the raw status it could not classify", () => {
    // Losing the string would leave `--json` with nothing an operator could take
    // to support.
    //
    // MUTANT: blank the status when the disposition is unrecognised.
    expect(readApprovalVerdict(approvalRow("paused"), "HX_ME")?.value.status).toBe("paused");
  });
});
