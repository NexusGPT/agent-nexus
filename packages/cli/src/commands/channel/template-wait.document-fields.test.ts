import { describe, expect, it } from "vitest";

import { submitApprovalDocumentFields } from "./template-submit-approval.document";
import { testSendDocumentFields } from "./template-test-send.document";
import { waitDocumentFields } from "./template-wait.document-fields";

/**
 * THE PROPERTIES OF THE DERIVATION, WHICH NINE DOCUMENTS CANNOT STATE.
 *
 * `template-wait.json-document.test.ts` drives all three verbs through commander
 * and asserts the nine documents `--json` actually writes. That is the contract,
 * and it is the stronger arm; nothing here repeats it.
 *
 * What a document case cannot say is a statement about the whole INPUT SPACE —
 * that a combination never occurs, that a set has exactly these members, that
 * two verbs' predicates have not quietly become one. Each of those is a claim
 * over every input rather than about one run, so each needs its own arm.
 *
 * ⚠️ ONE ARM PER `it`. A failing assertion throws and abandons the rest of its
 * own block, so a block with two arms is scored on whichever one a given mutant
 * happens to reach first — which is a property of the mutant, not of the order
 * they were written in.
 */

/** Every input this helper can be handed. Two booleans, so the space is four. */
const EVERY_INPUT = [true, false].flatMap((waited) =>
  [true, false].map((settled) => waitDocumentFields({ waited, settled }))
);

describe("the derivation", () => {
  /**
   * The legacy pair spells four combinations and reality reaches three. This is
   * the arm for the fourth: a command that never waited cannot have timed out,
   * and no input produces that row. `wait` cannot spell it at all, which is the
   * argument for the union existing beside the booleans rather than instead of
   * a comment saying it does not happen.
   */
  it("never spells the combination reality cannot reach", () => {
    expect(EVERY_INPUT.filter((f) => f.waited === false && f.timedOut === true)).toEqual([]);
  });

  /**
   * Exactly three members, asserted as a SET rather than by probing for each.
   * A fourth value appearing — or one of the three vanishing into another —
   * fails here, where three separate `toContain` arms would notice neither.
   */
  it("the union has exactly the three reachable members", () => {
    expect([...new Set(EVERY_INPUT.map((f) => f.wait))].sort()).toEqual([
      "not-requested",
      "resolved",
      "timed-out"
    ]);
  });

  it("the legacy pair agrees with the union on every input", () => {
    expect(
      EVERY_INPUT.filter(
        (f) => f.waited !== (f.wait !== "not-requested") || f.timedOut !== (f.wait === "timed-out")
      )
    ).toEqual([]);
  });
});

describe("what must NOT converge", () => {
  /**
   * Resolution and success are different questions, and this is the one a shared
   * field name most invites collapsing. A FAILED send has settled — the message
   * is dead and no further wait moves it — so reporting it as a timeout would
   * send a script back to poll a SID that will never change. `status` is what
   * says whether it succeeded; `wait` only says whether the poll got an answer.
   */
  it("a FAILED delivery is resolved, not timed out", () => {
    expect(
      testSendDocumentFields(
        { status: "failed", errorCode: 63016, errorMessage: "Cannot send", observedTerminal: true },
        true
      ).wait
    ).toBe("resolved");
  });
});

/**
 * THE ARMS THAT SEPARATE THE TWO DEFINITIONS OF "SETTLED".
 *
 * `settled` is read off the STATUS THE DOCUMENT REPORTS, and the obvious
 * alternative is the outcome's own `observedTerminal` — "a probe watched it
 * settle". The two agree on every ordinary run, which is why swapping one for
 * the other passes a suite built only from ordinary runs.
 *
 * 🔴 THEY DISAGREE ON EXACTLY ONE SHAPE, AND IT IS REACHABLE: the status the
 * SEND or the SUBMIT itself returned is already terminal, and no probe ever
 * confirmed it — both polls fall back to that status, and `test-send` swallows
 * probe failures, so a run whose every probe threw lands here. Under
 * `observedTerminal` the document then says the wait timed out over a message
 * that is already dead, and a script obeys it by polling a SID that will never
 * move again.
 */
describe("settled is read off the reported status, not off a probe", () => {
  it("a delivery already failed at send time is resolved with no probe", () => {
    expect(
      testSendDocumentFields(
        {
          status: "failed",
          errorCode: 63016,
          errorMessage: "Cannot send",
          observedTerminal: false
        },
        true
      ).wait
    ).toBe("resolved");
  });

  it("an approval already decided at submit time is resolved with no probe", () => {
    expect(
      submitApprovalDocumentFields(
        // `settled`, because `classifyApprovalStatus("approved")` says so. The
        // point of the arm is that `observedTerminal: false` does NOT make this
        // a timeout, so the disposition has to be the honest one.
        {
          status: "approved",
          rejectionReason: undefined,
          observedTerminal: false,
          disposition: "settled"
        },
        true
      ).wait
    ).toBe("resolved");
  });
});

describe("the two alphabets stay separate", () => {
  /**
   * The two verbs run their own terminal predicate over their own alphabet, and
   * this arm is the control on that: `delivered` settles a delivery and means
   * nothing to an approval, so an approval carrying it is still waiting. The arm
   * passes today and would fail the moment one predicate absorbed the other —
   * which is the single change that would make one `timedOut` mean two things.
   */
  it("a delivery vocabulary word is not an approval verdict", () => {
    expect(
      submitApprovalDocumentFields(
        // 🔴 `unrecognised`, and it is the whole arm. `classifyApprovalStatus`
        // puts a delivery word OUTSIDE the approval vocabulary rather than in
        // either half of it, and an unrecognised status is not terminal — which
        // is what makes "a delivery word is not an approval verdict" true BY
        // CLASSIFICATION and not by coincidence. Writing `settled` here would
        // leave the arm green, because the document derives its own answer from
        // `isApprovalTerminal(status)` and never reads this field — so the
        // literal would simply be a lie nothing checks.
        {
          status: "delivered",
          rejectionReason: undefined,
          observedTerminal: false,
          disposition: "unrecognised"
        },
        true
      ).wait
    ).toBe("timed-out");
  });

  it("an approval vocabulary word is not a delivery verdict", () => {
    expect(
      testSendDocumentFields(
        {
          status: "approved",
          errorCode: undefined,
          errorMessage: undefined,
          observedTerminal: false
        },
        true
      ).wait
    ).toBe("timed-out");
  });
});
