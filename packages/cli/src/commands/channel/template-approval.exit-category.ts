import { EXIT_CODES, type ExitCategory } from "../../exit-codes";

/**
 * WHAT META'S ANSWER DOES TO THIS PROCESS'S STATUS. ONE RULE, BOTH VERBS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE SAME REJECTION USED TO EXIT TWO DIFFERENT WAYS DEPENDING ON WHICH VERB
 *    FILED THE TEMPLATE, AND A `set -e` SCRIPT GOT OPPOSITE ANSWERS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `create --submit` exited `1` on a rejected verdict. `submit-approval --wait`
 * rendered the identical verdict, set nothing, exited `0`, and then printed
 * `Next: Attach to deployment` — a next step for a template Meta had just
 * refused. Two commands, one remote answer, three disagreements: the number, the
 * sign, and the advice.
 *
 * The rule is decided HERE rather than at each action body, because a rule
 * written twice is a rule that disagrees with itself twice as fast. Both verbs
 * call {@link applyApprovalVerdictExitCode}; neither of them names a category.
 *
 * ── WHY `outcome-not-reached` AND NOT SOMETHING ELSE ────────────────────────
 *
 * Its own declaration in `exit-codes.ts` is the argument, almost word for word:
 * "the operation RAN, and the outcome the caller wanted did not happen …
 * something changed and it was not enough … RETRYING IS THE TRAP: it repeats the
 * same successful half forever."
 *
 * That is a Meta rejection exactly. The template was created, the approval was
 * filed, both calls returned 2xx — the machine changed — and the thing the
 * caller wanted, a sendable template, did not happen. Re-running the command
 * files the same template again and gets the same answer, forever, which is the
 * precise failure mode that category exists to warn a script about.
 *
 * The three near misses, and why each is wrong:
 *
 *   - `failed` (the generic one) collapses "Meta said no" into "the CLI broke".
 *     That is the whole defect this rule closes: a caller cannot tell a verdict
 *     it must act on from a crash it should report. It is also what
 *     `create --submit` used to emit.
 *   - `invalid-input` refuses the INVOCATION. Nothing about the command line was
 *     wrong here — it was accepted, it ran, and state changed. That category
 *     promises the caller nothing happened, which is false.
 *   - `remote-error` is the server FAILING. Meta did not fail; Meta answered.
 *     `channel setup`'s own non-ready refusal took this one, and its site says
 *     why it is right there and not here: `setup` without `--auto` "changes
 *     nothing at all", so there is no outcome to have missed. A submitted
 *     template is the opposite case.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * ⚠️ IT NEVER WRITES `success`, AND THE ASYMMETRY IS THE POINT. A rejection sets
 * the status; every other verdict leaves `process.exitCode` exactly as it was.
 * Assigning `EXIT_CODES.success` on the non-rejected branch would read as more
 * complete and would silently ERASE any non-zero status an earlier step in the
 * same action had set. No current caller is in that position; the next one added
 * would be, and would fail by exiting 0 over its own refusal.
 *
 * ⚠️ A TIMEOUT IS NOT A REJECTION AND IS NOT DECIDED HERE. A pending status
 * never reaches {@link isApprovalRejected}, so nothing in this module can turn
 * the CLI's own impatience into a verdict — which is the whole reason the
 * timeout has a module of its own. `template-wait.exit-category.ts` owns it and
 * carries the argument: `submit-approval --wait` exits `timed-out` when its
 * budget runs out, and `create --submit` still exits 0, because its poll is
 * unconditional rather than a caller asking for a verdict.
 *
 * The two rules are written to be mutually exclusive rather than ordered: a
 * rejection is a settled status, and a settled status is not a timeout, so
 * whichever of the two applies at a call site, the other leaves the status
 * alone. Neither depends on running first.
 */

/**
 * The category a Meta rejection exits under. Named once, read by everything.
 *
 * A category and never a number: `exit-codes.ts` is the only place in this
 * package an exit code is written as an integer, and `exit-code-taxonomy.test.ts`
 * fails naming any file that forks that map.
 */
export const APPROVAL_REJECTED_EXIT_CATEGORY: ExitCategory = "outcome-not-reached";

/**
 * Meta refused this template.
 *
 * Keyed on the STATUS ALONE, and that is what makes the two verbs agree rather
 * than an accident of how this is written. They reach a status by different
 * routes: each polls on its own terminality predicate, and `submit-approval`
 * falls back to the status the submit call itself returned when no probe ever
 * found the row. Those routes have disagreed about which statuses end a poll,
 * and the predicates they use are being reconciled by another change — but no
 * definition of terminal can put `rejected` on the awaiting side, so this one
 * question is answerable identically at both sites whatever they settle on.
 *
 * Deliberately NOT keyed on "a probe observed it": a rejection reported by the
 * submit response is the same refusal as one a probe read, and a rule that
 * exits differently for the two would re-create the defect one layer down.
 */
export function isApprovalRejected(status: string | undefined): boolean {
  return status === "rejected";
}

/**
 * Apply the rule above to this process, for a verdict either verb arrived at.
 *
 * A `void` applier rather than a function returning a code, so the "leave it
 * alone unless it is a rejection" half of the rule lives here too. A call site
 * spelled `process.exitCode = approvalVerdictExitCode(status)` would have to
 * return SOMETHING on the other branch, and the only honest something is a
 * clobber.
 */
export function applyApprovalVerdictExitCode(status: string | undefined): void {
  if (isApprovalRejected(status)) {
    process.exitCode = EXIT_CODES[APPROVAL_REJECTED_EXIT_CATEGORY];
  }
}
