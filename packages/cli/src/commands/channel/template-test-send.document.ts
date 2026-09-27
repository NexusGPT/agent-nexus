import { type DeliveryOutcome, isDeliveryTerminal } from "./template-test-send.await-delivery";
import { waitDocumentFields } from "./template-wait.document-fields";

/**
 * The fields `test-send` adds to its `--json` record on top of the send
 * response, assembled in one place.
 *
 * ── WHAT A CONSUMER SEES THAT IT DID NOT BEFORE ───────────────────────────────
 *
 * ADDED: `wait` (`not-requested` / `resolved` / `timed-out`) and `timedOut`.
 * Until now this document could say `waited: true` and nothing about what came
 * of it, so "Twilio settled it" and "the poll gave up with the message still in
 * flight" were the same record and a script had to re-derive the difference from
 * `status` against a delivery vocabulary it had to know by heart.
 *
 * ⚠️ `timedOut` HERE IS NOT A FAILURE AND NOT THE SAME NEXT STEP AS ITS
 * APPROVAL SIBLING. A timed-out delivery is still in transit; the message SID in
 * this same document is how a caller asks again. A FAILED delivery is
 * `wait: "resolved"` with a failed `status` — resolution and success are
 * different questions, and only `status` answers the second.
 *
 * UNCHANGED: `waited`, and `status` / `errorCode` / `errorMessage`.
 */
export function testSendDocumentFields(
  outcome: DeliveryOutcome | undefined,
  waited: boolean
): Record<string, unknown> {
  // `outcome` is undefined exactly when `--wait` was not given. The only other
  // way to leave it unset is a poll that threw, and that path rethrows out of
  // the action before any document is printed — so `settled` is never consulted.
  if (outcome === undefined) return waitDocumentFields({ waited, settled: false });

  return {
    status: outcome.status,
    ...(outcome.errorCode === undefined ? {} : { errorCode: outcome.errorCode }),
    ...(outcome.errorMessage === undefined ? {} : { errorMessage: outcome.errorMessage }),
    ...waitDocumentFields({ waited, settled: isDeliveryTerminal(outcome.status) })
  };
}
