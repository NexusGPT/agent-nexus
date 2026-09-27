import { EXIT_CODES, type ExitCategory } from "../../exit-codes";
import { isDeliveryFailed } from "./template-test-send.await-delivery";

/**
 * WHAT TWILIO'S DELIVERY ANSWER DOES TO THIS PROCESS'S STATUS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A BILLED, UNDELIVERED MESSAGE EXITED `1`, WHICH IS THE NUMBER THIS CLI USES
 *    FOR "SOMETHING BROKE AND I HAVE NO BETTER WORD FOR IT".
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `test-send --wait` set a bare `process.exitCode = 1` on a failed or
 * undelivered status — the last such site in `commands/channel.ts`, and the last
 * reason that file appeared in `EXPECTED_BARE_ONE_SITES`, a list whose own
 * header says it may only ever shrink. `1` is the generic fallback and its
 * declaration says so: reaching for it because the category is inconvenient to
 * determine is how this CLI once had 467 sites that all said `1`.
 *
 * The category is not inconvenient to determine here. `outcome-not-reached`
 * describes this send almost word for word — "the operation RAN, and the outcome
 * the caller wanted did not happen … something changed and it was not enough …
 * RETRYING IS THE TRAP: it repeats the same successful half forever."
 *
 * A test-send meets every clause. Twilio accepted the message, Meta carried it,
 * MONEY MOVED — `test-send`'s own help says there is no dry run and nothing is
 * refundable — and the thing the caller wanted, a message on a phone, did not
 * happen. Re-running bills again and, for a wrong number or a template Meta
 * refuses at send time, fails again for the same reason. That is the precise
 * failure mode this category exists to warn a script about, and it is the one
 * thing `1` cannot say.
 *
 * The near misses, and why each is wrong:
 *
 *   - `remote-error` (6) is the server FAILING. Twilio did not fail; Twilio
 *     reported a delivery outcome, which is the request working.
 *   - `connection-failed` (7) promises RETRYABLE. A retry here is a second
 *     charge for the same failure.
 *   - `timed-out` (8) is what this verb exits when the poll gives up with the
 *     message still moving — see `template-wait.exit-category.ts`. A settled
 *     failure is the opposite of that: something WAS decided.
 *
 * `create --submit` and `submit-approval --wait` exit the same `10` on a Meta
 * rejection, for the same reading of the same declaration. That agreement is
 * worth having and is NOT a reason to merge the two rules into one module: the
 * remotes are different, the alphabets are different — `rejected` against
 * `failed` / `undelivered` — and a file deciding both would have to hold two
 * unrelated status vocabularies to justify one shared constant.
 * `template-wait.document-fields.ts` already refuses that convergence for the
 * document ("THE TERMINAL VOCABULARY DOES NOT CONVERGE AND MUST NOT"); the exit
 * codes follow the same seam. One module per remote, plus one for the poll.
 *
 * ── KEYED ON THE STATUS, NOT ON "A PROBE SAW IT" ────────────────────────────
 *
 * 🔴 THE OLD CONDITION WAS `observedTerminal && isDeliveryFailed(status)`, AND
 * THE FIRST HALF WAS A HOLE. `observedTerminal` is false when no probe ever
 * returned — every read threw and was swallowed — in which case the reported
 * status falls back to the one the SEND itself returned. A send that came back
 * `failed` immediately therefore rendered as a failure, put `"wait": "resolved"`
 * and a failed `status` in the `--json` document, and exited `0`.
 *
 * The document module already decided this question the other way and said why:
 * `settled` is "read off the reported status rather than off 'a probe watched it
 * settle', and the difference is not academic: a send that came back `failed`
 * before any probe ran is settled, and calling that a timeout sends a script
 * back to wait on a message that is already dead." The exit code now reads the
 * same field the document does, so the two cannot disagree about whether this
 * send failed. `isApprovalRejected` is deliberately status-keyed for the
 * identical reason at the approval sites.
 */

/**
 * The category a settled delivery failure exits under. Named once.
 *
 * A category and never a number: `exit-codes.ts` is the only place in this
 * package an exit code is written as an integer, and `exit-code-taxonomy.test.ts`
 * fails naming any file that forks that map.
 */
export const DELIVERY_FAILED_EXIT_CATEGORY: ExitCategory = "outcome-not-reached";

/**
 * Apply the rule above to this process, for the delivery status `--wait` ended on.
 *
 * A `void` applier rather than a function returning a code, for the reason its
 * approval sibling gives: the "leave it alone unless it failed" half of the rule
 * belongs here too, and a call site spelled `process.exitCode = …` would have to
 * return SOMETHING on the other branch, where the only honest something is a
 * clobber of whatever an earlier step set.
 */
export function applyDeliveryVerdictExitCode(status: string): void {
  if (isDeliveryFailed(status)) {
    process.exitCode = EXIT_CODES[DELIVERY_FAILED_EXIT_CATEGORY];
  }
}
