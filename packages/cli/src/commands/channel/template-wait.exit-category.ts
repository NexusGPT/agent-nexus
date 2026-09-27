import { EXIT_CODES, type ExitCategory } from "../../exit-codes";
import type { WaitFacts } from "./template-wait.document-fields";

/**
 * WHAT THIS CLI'S OWN IMPATIENCE DOES TO THIS PROCESS'S STATUS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A `--wait` THAT GAVE UP EXITED `0`, SO THE NUMBER COULD NOT SEPARATE
 *    "THE REMOTE ANSWERED" FROM "WE STOPPED ASKING".
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` forbids that collapse in its own words: "a check that could
 * not run (`7` unreachable, `8` timed out, `6` server errored) is never reported
 * as a check that ran and failed." A timeout at `0` is WORSE than the thing that
 * sentence forbids — it reports a check that ran and PASSED. `submit-approval
 * --wait` exiting 0 on a pending review told a `set -e` script the template was
 * fine; `test-send --wait` exiting 0 on a message still in flight told it the
 * send had landed.
 *
 * The precedent is in this package and it is the same flag: `prompt-assistant
 * --wait` exits `8` on a timeout through `reportFailure("timed-out", …)`, and
 * its `outcome` field MIRRORS that code rather than replacing it. This is that
 * rule, for the three verbs in this directory.
 *
 * ── IT IS DOMAIN-FREE, AND THAT IS WHY IT IS NOT IN THE APPROVAL MODULE ──────
 *
 * This file never sees a status string and has no way to grow an opinion about
 * one. A timed-out approval and a timed-out delivery are the SAME fact — one
 * `pollForTerminalState` loop spent its budget — which is exactly the argument
 * {@link import("./template-wait.document-fields").waitDocumentFields} already
 * makes for the `wait` key it derives from the same two booleans. The exit code
 * follows that seam instead of inventing a second one: what the CLI's impatience
 * means is decided HERE, once, for both remotes; what a settled verdict means is
 * decided per remote, in `template-approval.exit-category.ts` for Meta and
 * `template-test-send.exit-category.ts` for Twilio.
 *
 * ── THE STRONGEST OBJECTION, WHICH IS REAL ──────────────────────────────────
 *
 * 🔴 A TIMEOUT IS THE ORDINARY OUTCOME HERE, NOT AN EDGE CASE. Meta's review is
 * routinely slower than two minutes — `template-create.await-verdict.ts` says so
 * at its own site. A gate that reds on the common case is a gate somebody papers
 * over with `|| true`, and `|| true` swallows EVERYTHING, including the Meta
 * rejection this same change set just made visible. That is a worse outcome than
 * the defect, and it is the reason to answer the objection here rather than
 * leave it for whoever meets the red.
 *
 * Three things make the trade the right way round:
 *
 *   - `--wait` IS NOT THE DEFAULT. It is an explicit request whose entire
 *     product is the verdict. Failing to obtain it is the flag not delivering,
 *     not the command failing — and a caller who does not want to gate on that
 *     simply does not pass the flag. Nothing about the default path moved.
 *   - THE CALLER HAS A NARROWER TEST THAN `|| true`. The `--json` document
 *     carries `wait`, one of `not-requested` / `resolved` / `timed-out`, and the
 *     `--help` for all three verbs now says to read it. A script that wants
 *     "stop on a refusal, carry on through a timeout" tests that key, or tests
 *     the code against the rejection category alone. `prompt-assistant --wait`
 *     published the same pairing and it is what its own help tells callers.
 *   - `prompt-assistant --wait` ALREADY ACCEPTED THIS COST with its timeout
 *     equally ordinary, so this is the package agreeing with itself rather than
 *     a new opinion.
 *
 * ── THE THIRD STATE: A LIST THIS CLI COULD NOT READ AT ALL ──────────────────
 *
 * 🔴 SINCE THE APPROVAL PROBE STARTED SWALLOWING, "META IS STILL REVIEWING" AND
 * "I COULD NOT READ THE APPROVALS LIST ONCE" ARRIVE HERE IDENTICAL. Both come
 * back unsettled with the submit's own status, and both now exit `8`. That is
 * not merely what the current shape allows — it is the right answer, and the two
 * near misses are wrong rather than unavailable:
 *
 *   - `connection-failed` (7) promises RETRYABLE, in its own declaration. The
 *     write already succeeded: the template is filed with Meta, the message is
 *     sent and billed. A caller that backs off and re-sends on `7` files a
 *     second approval for a Content SID that may be submitted exactly once, or
 *     pays for a second message.
 *   - `remote-error` (6) promises the request arrived and THE SERVER FAILED.
 *     Nothing here establishes that. One swallowed read is a read this CLI did
 *     not complete, which is a statement about this process, not about Twilio.
 *
 * `timed-out`'s own declaration covers both states exactly: "The CLI stopped
 * waiting. NOT a synonym for `connection-failed` — the server may still be
 * completing the request, so a blind retry of a write can duplicate it." True of
 * a pending review and true of an unreadable list. The category is about THIS
 * PROCESS giving up, never about the remote's health, which is precisely why one
 * code is honest for both.
 *
 * ⚠️ THE COST IS REAL AND IS NOT HIDDEN: a persistently broken
 * `listTemplateApprovals` is indistinguishable at the exit code from an ordinary
 * pending review. The read failure is reportable — just not on a write verb
 * whose non-zero invites a retry that re-bills. `nexus channel whatsapp-template
 * approvals` is a read-only verb with nothing to retry-trap, its probe failures
 * PROPAGATE, and it is where the timeout line already sends the operator.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT COVER ───────────────────────────────────
 *
 * ⚠️ `create --submit` IS NOT A `--wait` VERB AND DOES NOT REACH THIS RULE. Its
 * 30-second poll is unconditional — there is no flag to decline it — so its
 * timeout is not a caller asking for a verdict and missing it; it is a create
 * that fully succeeded, with a courtesy glance at the review. Exiting non-zero
 * there would make the ordinary success of the primary operation report as a
 * failure. Its help says a timeout still exits 0, and that stays true.
 *
 * ⚠️ IT NEVER WRITES `success`, on the same ground as
 * {@link import("./template-approval.exit-category").applyApprovalVerdictExitCode}:
 * assigning `EXIT_CODES.success` on the resolved branch would silently ERASE a
 * non-zero status an earlier step set — including that module's own rejection,
 * which is set from the same action body two lines earlier.
 */

/**
 * The category a spent `--wait` budget exits under. Named once, read by both.
 *
 * A category and never a number: `exit-codes.ts` is the only place in this
 * package an exit code is written as an integer, and `exit-code-taxonomy.test.ts`
 * fails naming any file that forks that map.
 */
export const WAIT_TIMED_OUT_EXIT_CATEGORY: ExitCategory = "timed-out";

/**
 * Apply the rule above, for a wait either `--wait` verb has finished.
 *
 * Takes the SAME {@link WaitFacts} the `--json` document is built from, so the
 * number and the document's `wait` key cannot disagree — a process exiting `8`
 * beside a record reading `"wait": "resolved"` is the collapse this rule closes,
 * wearing the cure's clothes. `template-wait.exit-category.test.ts` pins the two
 * against each other over every combination rather than trusting that sentence.
 *
 * A `void` applier rather than a function returning a code, for the reason its
 * approval sibling gives: the "leave it alone unless it timed out" half of the
 * rule has to live here too, and a call site spelled `process.exitCode = …`
 * would need SOMETHING on the other branch, where the only honest something is a
 * clobber.
 */
export function applyWaitExitCode(facts: WaitFacts): void {
  if (facts.waited && !facts.settled) {
    process.exitCode = EXIT_CODES[WAIT_TIMED_OUT_EXIT_CATEGORY];
  }
}
