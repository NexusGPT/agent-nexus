import type { DeliveryOutcome } from "./template-test-send.await-delivery";

/**
 * The fields `test-send` adds to its `--json` record on top of the send
 * response, assembled in one place.
 *
 * 🔴 THERE IS NO `timedOut` HERE AND ITS SIBLING `submit-approval` HAS ONE, for
 * the same "--wait gave up" condition. That asymmetry is inherited and is
 * preserved rather than quietly corrected: adding the field changes what every
 * existing consumer of this document sees, which is a contract decision. A
 * script that needs it today has to re-derive it from `status`.
 */
export function testSendDocumentFields(
  outcome: DeliveryOutcome | undefined,
  waited: boolean
): Record<string, unknown> {
  if (outcome === undefined) return { waited };

  return {
    status: outcome.status,
    ...(outcome.errorCode === undefined ? {} : { errorCode: outcome.errorCode }),
    ...(outcome.errorMessage === undefined ? {} : { errorMessage: outcome.errorMessage }),
    waited
  };
}
