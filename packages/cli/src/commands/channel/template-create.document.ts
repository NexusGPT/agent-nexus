import type { CreateApprovalOutcome } from "./template-create.await-verdict";

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
 */
export function createApprovalDocument(
  submitted: object,
  outcome: CreateApprovalOutcome
): Record<string, unknown> {
  return {
    ...submitted,
    ...(outcome.status === undefined ? {} : { status: outcome.status }),
    ...(outcome.rejectionReason === undefined ? {} : { rejectionReason: outcome.rejectionReason })
  };
}
