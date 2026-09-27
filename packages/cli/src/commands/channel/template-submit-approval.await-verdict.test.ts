import { afterEach, describe, expect, it, vi } from "vitest";

import {
  awaitApprovalVerdict,
  type SubmitApprovalOutcome
} from "./template-submit-approval.await-verdict";

/**
 * The two behaviour changes this verb carries, each with its own `it` — a
 * failing assertion aborts the rest of its block, so one arm per block is what
 * makes a mutant's red attributable to the property named in the title.
 *
 * Fake timers, because the real window is a 120 s budget on a 5 s interval and
 * the arms below need two intervals to pass. `vi.useFakeTimers` fakes `Date` as
 * well as `setTimeout`, which is what the loop tests its budget against.
 *
 * Each promise gets its rejection handler attached SYNCHRONOUSLY, so a mutant
 * that makes the wait reject surfaces as this arm's own assertion failure rather
 * than as an unhandled rejection with no test named on it.
 */

const settle = (promise: Promise<SubmitApprovalOutcome>): Promise<SubmitApprovalOutcome | Error> =>
  promise.then(
    (outcome) => outcome,
    (error: unknown) => (error instanceof Error ? error : new Error(String(error)))
  );

const approvedRow = [{ sid: "HX_ME", approvalRequests: { status: "approved" } }];

/** Throws on its first call, answers `approved` on every one after it. */
function oneTransientFailureThenApproved(): () => Promise<unknown> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient 502 from listTemplateApprovals");
    return approvedRow;
  };
}

/** Two 5 s intervals: the first probe throws, the second reads `approved`. */
async function runTwoIntervals(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
  await vi.advanceTimersByTimeAsync(5_000);
}

describe("awaitApprovalVerdict — a flaky read must not cost a successful submit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reject when one list call throws mid-wait", async () => {
    vi.useFakeTimers();
    const settled = settle(
      awaitApprovalVerdict(oneTransientFailureThenApproved(), "HX_ME", "pending")
    );
    await runTwoIntervals();

    // This is the whole of the probe-policy decision. A Content SID can be
    // submitted to Meta exactly once, so an exit code reading "the submit
    // failed" invites a retry that cannot succeed.
    //
    // MUTANT: put the site back to "propagate" -> the first throw ends the wait
    // and this resolves to the Error.
    expect(await settled).not.toBeInstanceOf(Error);
  });

  it("goes on to report the verdict the NEXT probe saw", async () => {
    vi.useFakeTimers();
    const settled = settle(
      awaitApprovalVerdict(oneTransientFailureThenApproved(), "HX_ME", "pending")
    );
    await runTwoIntervals();

    // Not reject-or-not: the remaining budget is actually spent asking, and the
    // answer that arrives is the one reported. `propagate` threw away ~115 s of
    // a budget the operator asked for by typing `--wait`.
    //
    // MUTANT: "propagate" -> an Error. MUTANT: stop after the throwing probe ->
    // the submit's own "pending" comes back with observedTerminal false.
    expect(await settled).toEqual({
      status: "approved",
      rejectionReason: undefined,
      observedTerminal: true,
      disposition: "settled"
    });
  });

  it("keeps asking through a status the OLD wide predicate called a verdict", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const listApprovals = async () => {
      calls += 1;
      return [
        { sid: "HX_ME", approvalRequests: { status: calls === 1 ? "received" : "approved" } }
      ];
    };

    const settled = settle(awaitApprovalVerdict(listApprovals, "HX_ME", "pending"));
    await runTwoIntervals();

    // The verb that moved. `received` used to end this poll on the first probe
    // and print "Approval resolved: received"; it is a wait state, so the poll
    // now runs on and reports what Meta actually ruled.
    //
    // MUTANT: add "received" to SETTLED_STATUSES, or spell the predicate
    // `!== "awaiting"` -> the outcome is `received` with observedTerminal true.
    expect(await settled).toMatchObject({ status: "approved", observedTerminal: true });
  });
});
