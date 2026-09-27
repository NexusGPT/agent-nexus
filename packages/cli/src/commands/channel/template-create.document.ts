import { isApprovalTerminal } from "./template-approval.read-verdict";
import type { CreateApprovalOutcome } from "./template-create.await-verdict";
import { waitDocumentFields } from "./template-wait.document-fields";

/**
 * The `approval` sub-document `create --submit` puts inside its `--json` record.
 *
 * ONE place decides what that object holds. It used to be three `let`s declared
 * at the top of the action and assigned from three different depths of the
 * submit-and-poll block, with the object literal a hundred lines further down —
 * so what `--json` contained could only be established by reading the whole
 * callback and simulating it.
 *
 * A key is OMITTED rather than emitted as `null` when the poll never learned it,
 * because `jq` reads an absent key and an explicit null identically while a
 * consumer that tests `has("status")` can tell them apart.
 *
 * ── WHAT A CONSUMER SEES THAT IT DID NOT BEFORE ───────────────────────────────
 *
 * ADDED: `wait`, `waited` and `timedOut`, the same three its two sibling verbs
 * carry. This object could previously say nothing at all about the poll behind
 * it, so a review still pending after 30 seconds and one Meta had actually ruled
 * on differed only in a `status` a caller had to interpret — and when no probe
 * ever found the row there was no `status` either, leaving the two
 * indistinguishable.
 *
 * `waited` is always `true` here and that is not a placeholder: this object is
 * built on the `--submit` path only, and that path polls unconditionally — there
 * is no flag to decline it. The absence of the whole `approval` object is what
 * "did not wait" looks like on this verb, so `not-requested` is unreachable
 * INSIDE it. The field ships anyway, because a consumer reading all three verbs
 * with one expression is the point.
 *
 * UNCHANGED: `status` and `rejectionReason`, including their omission rules.
 */
export function createApprovalDocument(
  submitted: object,
  outcome: CreateApprovalOutcome
): Record<string, unknown> {
  return {
    ...submitted,
    ...(outcome.status === undefined ? {} : { status: outcome.status }),
    ...(outcome.rejectionReason === undefined ? {} : { rejectionReason: outcome.rejectionReason }),
    // No status at all means no probe ever found the row, which is a timeout and
    // not a verdict — the one reading that has to be spelled out, because
    // `settled` is derived from a status here and there is none to derive from.
    ...waitDocumentFields({
      waited: true,
      settled: outcome.status !== undefined && isApprovalTerminal(outcome.status)
    })
  };
}
