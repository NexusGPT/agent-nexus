import { isApprovalTerminal } from "./template-approval.read-verdict";
import type { SubmitApprovalOutcome } from "./template-submit-approval.await-verdict";
import { waitDocumentFields } from "./template-wait.document-fields";

/**
 * The fields `submit-approval` adds to its `--json` record on top of the submit
 * response, assembled in one place.
 *
 * `timedOut` is the field that makes the record honest: a `--wait` that gave up
 * with a pending status has TIMED OUT rather than reached a verdict, and a
 * consumer reading only `status` cannot tell those apart. It is false whenever
 * `--wait` was not given, because a command that never waited cannot have timed
 * out. The exit code now says the same thing — `template-wait.exit-category.ts`
 * exits `timed-out` off the same `settled` this file computes, where the verb
 * used to exit 0 and report the timeout in this field alone.
 *
 * ── WHAT A CONSUMER SEES THAT IT DID NOT BEFORE ───────────────────────────────
 *
 * ADDED: `wait`, one of `not-requested` / `resolved` / `timed-out`. This verb
 * was already the only one of the three able to express all three states, so the
 * new key renames nothing here — it spells out loud what `waited` and `timedOut`
 * encoded between them, and it is the key the two sibling verbs now answer too.
 *
 * UNCHANGED: `waited`, and `status` / `rejectionReason`. `timedOut` keeps its
 * derivation and is now read off `wait` rather than computed here.
 *
 * 🔴 `timedOut`'S VALUE DOES MOVE FOR ONE FAMILY OF STATUSES, AND THE CAUSE IS
 * THE PREDICATE UNDER IT RATHER THAN THIS FILE. It used to ask "is the status
 * anything other than `pending` or `unsubmitted`", which made `received` — a
 * real Meta status, and a WAIT state — read as a resolution. The converged
 * `isApprovalTerminal` asks whether Meta actually ruled, so `received` now reads
 * as the timeout it is. A consumer that keyed off `timedOut === false` to mean
 * "Meta answered" was wrong on that status before and is right now.
 */
export function submitApprovalDocumentFields(
  outcome: SubmitApprovalOutcome | undefined,
  waited: boolean
): Record<string, unknown> {
  // `outcome` is undefined exactly when `--wait` was not given. The only other
  // way to leave it unset is a poll that threw, and that path rethrows out of
  // the action before any document is printed — so `settled` is never consulted.
  if (outcome === undefined) return waitDocumentFields({ waited, settled: false });

  return {
    status: outcome.status,
    ...(outcome.rejectionReason === undefined ? {} : { rejectionReason: outcome.rejectionReason }),
    ...waitDocumentFields({ waited, settled: isApprovalTerminal(outcome.status) })
  };
}
