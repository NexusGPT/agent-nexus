/**
 * ONE ANSWER TO "NO TERMINAL, NO --yes": REFUSE.
 *
 * ── What one flag name used to mean ──────────────────────────────────────────
 *
 * Several behaviours behind one flag, and a reader's mental model came from
 * whichever command they had read last. The two that lost data both PROCEEDED:
 * gated on `stdin`, or gated on `stdout`, a destructive verb run from a script
 * deleted with no prompt, no warning and a success envelope — and a script is
 * precisely the place where nobody is watching.
 *
 * A third spelling declared `--yes` with NO prompt behind it, so the flag
 * documented a confirmation that did not exist and the delete happened at a
 * terminal exactly as it did in CI. All three are gone from the tree.
 * `destructive-confirmation.test.ts` holds what is left, and it is the safe
 * half: commands that REFUSE through a correct local parser.
 *
 * ── The rule, and why this direction ─────────────────────────────────────────
 *
 * REFUSING COSTS ONE RETRY. PROCEEDING COSTS THE DATA. That asymmetry decides
 * it on its own, and the absence of a terminal makes it sharper rather than
 * softer: it is the one condition that guarantees no human is present to notice
 * the mistake. So "I could not ask" resolves to "I did not act".
 *
 * ── Why there is no second class ─────────────────────────────────────────────
 *
 * There is no "confirmable but safe to proceed silently" tier, deliberately. If
 * it is safe to proceed with no answer, there was no reason to ask — such a
 * command should declare no `--yes` at all. Admitting the tier is what produced
 * six behaviours from one idea, because every author reasonably decided their
 * own command was in it.
 *
 * ── STDIN, NOT STDOUT — one word, and it changes what a pipe does ────────────
 *
 * A confirmation READS. `process.stdout.isTTY` answers "is my OUTPUT a
 * terminal", which is a different question. Three consequences of the wrong
 * stream, and the third is the one that reads as a hang rather than a bug:
 *
 *   - `nexus <destructive> > log.txt` — stdout is a pipe, stdin is still the
 *     operator's terminal. The stdout form skips the prompt entirely. On the
 *     `proceed` variants that is a silent delete from an interactive session.
 *   - `echo y | nexus <destructive>` — stdin is a pipe, stdout is still a
 *     terminal. The stdout form prompts and consumes the piped `y`, which is
 *     the answer arriving from a script rather than a person.
 *   - `nexus <destructive> < /dev/null` — stdout is a terminal, so the stdout
 *     form asks; stdin has already ended, so nothing can settle the promise.
 *     The question prints and the process sits there forever.
 *
 * Redirecting output is not a statement about who is answering. Reading stdin
 * is the only test of that, so it is the only one used here.
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer keeps one import path while each concern stays its own module:
 *
 *   `.flag.ts`         declaring `--yes`, and the WeakSet that lets the gate
 *                      see a confirmation exists at all
 *   `.stream.ts`       which stream a question and its conversation go on
 *   `.destructive.ts`  the ask itself, and the refusal when there is no
 *                      terminal to ask
 */

export { confirmDestructive } from "./confirm.destructive";
export { confirmable, isConfirmable, YES_FLAG_DESCRIPTION } from "./confirm.flag";
export { promptLine, promptStream } from "./confirm.stream";
