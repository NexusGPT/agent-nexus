import { color } from "../../output";
import {
  type DeliveryOutcome,
  isDeliveryFailed,
  isDeliveryTerminal
} from "./template-test-send.await-delivery";

/**
 * Narrate what `test-send --wait`'s poll saw, on the human channel only.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * FOUR OUTCOMES, FOUR LINES, AND NO INPUT THAT PRINTS NOTHING
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The unconfirmed branch — a send whose own status is already terminal, with no
 * probe having confirmed it — used to print nothing at all. It is the same shape
 * `template-submit-approval.verdict.render.ts` closes, and that file carries the
 * argument for why this is NOT the timeout line in full: the `--json` document
 * derives `settled` from the status and so says `wait: "resolved"` on this very
 * branch, and calling it a timeout would send a script back to wait on a message
 * that is already dead. `WaitFacts.settled` uses this exact case to say so.
 *
 * ── HOW IT IS REACHED HERE, WHICH DIFFERS FROM THE APPROVAL SIBLING ───────────
 *
 * `readDeliveryStatus` always returns a reading, so the poll comes back empty
 * only when EVERY probe threw and the swallow policy ate each one. Combined with
 * a send whose own response already reported `delivered` / `read` / `failed` /
 * `undelivered`, that is this branch. The approval sibling has a second route —
 * a row simply absent from a 200 OK list — that this one does not.
 *
 * ── TWO THINGS THIS LINE DELIBERATELY DOES NOT DO ────────────────────────────
 *
 * ⚠️ IT CARRIES NO "CHECK AGAIN" POINTER, AND THAT IS NOT AN OVERSIGHT. No CLI
 * verb re-reads a delivery status; the only verb in reach is `test-send` itself,
 * which SENDS ANOTHER REAL BILLED MESSAGE. The message SID printed above is the
 * handle, and `template-test-send.document.ts` says so for the `--json` side.
 * Adding a pointer here would bill someone for a status read.
 *
 * ⚠️ IT IS NOT COLOURED, WHERE THE CONFIRMED LINES ARE. The green tick and the
 * red cross are this renderer's way of saying a probe WATCHED delivery settle;
 * spending them on a status nothing corroborated makes the confirmed and
 * unconfirmed branches indistinguishable at a glance, which is the one fact this
 * branch exists to carry. The status word is still printed, so nothing is hidden
 * — and note the caller's `process.exitCode = 1` is gated on `observedTerminal`,
 * so an unconfirmed `failed` exits 0 and this line is all the operator gets.
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

  if (isDeliveryTerminal(outcome.status)) {
    console.log(
      `Unconfirmed: the send reported ${outcome.status} and no delivery status was readable in 2m.`
    );
    return;
  }

  console.log(`Status still '${outcome.status}' after 2m. The message may still be in transit.`);
}
