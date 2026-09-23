import { color } from "../../output";
import {
  type DeliveryOutcome,
  isDeliveryFailed,
  isDeliveryTerminal
} from "./template-test-send.await-delivery";

/**
 * Narrate what `test-send --wait`'s poll saw, on the human channel only.
 *
 * ⚠️ THE FOURTH BRANCH IS SILENCE, AND IT IS FAITHFUL RATHER THAN AN OVERSIGHT —
 * the same gap `template-submit-approval.verdict.render.ts` documents: a send
 * whose own status is already terminal, with no probe having confirmed it,
 * printed nothing at all. Preserved so the split changes no output.
 */
export function renderDeliveryOutcome(outcome: DeliveryOutcome): void {
  if (outcome.observedTerminal) {
    if (isDeliveryFailed(outcome.status)) {
      console.log(color.red(`✗ Message ${outcome.status}.`));
      if (outcome.errorCode) {
        console.log(`  Error ${outcome.errorCode}: ${outcome.errorMessage ?? "Unknown error"}`);
      }
      return;
    }
    console.log(color.green(`✓ Message ${outcome.status}.`));
    return;
  }

  if (!isDeliveryTerminal(outcome.status)) {
    console.log(`Status still '${outcome.status}' after 2m. The message may still be in transit.`);
  }
}
