import { color } from "../../output";
import type { SubmitApprovalOutcome } from "./template-submit-approval.await-verdict";

/**
 * Narrate what `submit-approval --wait`'s poll saw, on the human channel only.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THREE OUTCOMES, THREE LINES, AND NO INPUT THAT PRINTS NOTHING
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This function used to have a fourth state it rendered as SILENCE: a settled
 * status that no probe ever confirmed printed neither the resolution line (it
 * lived inside the poll loop) nor the timeout line (its condition was false). An
 * operator who typed `--wait`, waited two minutes and was told nothing had to
 * infer the verdict from a `Next:` line further down that was derived from the
 * same unconfirmed status and stated it as fact.
 *
 * ── HOW THAT STATE IS REACHED, WHICH IS AN ORDINARY PATH AND NOT AN EDGE ──────
 *
 * `submitApproval` is IDEMPOTENT at the Twilio client: it reads the template's
 * current status from `contents(<sid>).approvalFetch()` first and, for anything
 * but `unsubmitted`, returns THAT as the submit response with
 * `alreadySubmitted: true`. So re-running this verb on a template Meta has
 * already ruled on returns `approved` or `rejected` from the submit call itself.
 *
 * The poll then reads a DIFFERENT endpoint — the account-wide
 * `contentAndApprovals.list()` — and can fail to find the row while returning
 * 200: `list-template-approvals.use-case.ts` catches a per-connection fetch
 * failure and `continue`s, so that connection contributes no rows at all. Both
 * halves are ordinary behaviour, and together they are exactly this branch.
 *
 * ── WHY IT IS NOT THE TIMEOUT LINE, WHICH IS THE TEMPTING ANSWER ──────────────
 *
 * "No probe observed it, so it is epistemically a timeout" is wrong three times:
 *
 *   · IT CONTRADICTS THIS COMMAND'S OWN `--json` ON THE SAME RUN.
 *     `waitDocumentFields` derives `settled` from the STATUS, not from "a probe
 *     watched it settle" — `WaitFacts.settled` argues that case explicitly — so
 *     this branch emits `wait: "resolved"`, `timedOut: false`. A human line
 *     reading "still …, check again" is the report the JSON denies.
 *   · IT CONTRADICTS THE EXIT CODE. `applyApprovalVerdictExitCode` is keyed on
 *     the status alone and says so, so a rejection here exits
 *     `outcome-not-reached`. Telling an operator to wait on a verdict the
 *     process has already treated as final is the disagreement that rule closed.
 *   · NOTHING OBSERVED IT IS FALSE. The status came from a live Twilio read of
 *     this template's own approval record. What is missing is CORROBORATION from
 *     the account-wide list, which is a different claim and gets a different
 *     word.
 *
 * So the line reports the verdict, names where it came from, and says plainly
 * that it is unconfirmed. The reason for a rejection is structurally unavailable
 * here — it lives on the row no probe read — which is the other half of why the
 * pointer at `approvals` belongs on this branch and not only on the timeout.
 */
export function renderSubmitApprovalVerdict(outcome: SubmitApprovalOutcome): void {
  if (outcome.observedTerminal) {
    console.log(`Approval resolved: ${color.cyan(outcome.status)}`);
    if (outcome.rejectionReason) console.log(`Reason: ${outcome.rejectionReason}`);
    return;
  }

  // Read off the outcome's OWN classification rather than re-deriving it from
  // the status here. The two could only ever disagree, and `disposition` is the
  // field the poll already computed from the one converged predicate.
  if (outcome.disposition === "settled") {
    console.log(
      `Unconfirmed: the submission reported ${color.cyan(outcome.status)} and no approval record was readable in 2m.`
    );
    console.log(`Confirm: ${color.dim("nexus channel whatsapp-template approvals")}`);
    return;
  }

  // `awaiting` and `unrecognised` both land here, and both are honestly served
  // by this line: the poll really did spend its budget, and `approvals` really
  // is the next step for either. They are told apart in `--json` by
  // `disposition`; a renderer that wants different words for them branches here.
  console.log(
    `Still ${outcome.status} after 2m. Check again: ${color.dim("nexus channel whatsapp-template approvals")}`
  );
}
