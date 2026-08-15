import { Command } from "commander";

import { refuse } from "../errors";

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
 */

/** The description every `--yes` flag carries, in these exact words. */
export const YES_FLAG_DESCRIPTION =
  "Confirm without prompting. Required in a script: with no terminal this refuses instead of proceeding.";

/**
 * Commands whose confirmation is known to go through this path.
 *
 * A WeakMap keyed on the `Command`, the same shape `contract-binding.ts` uses
 * and for the same reason: the gate builds throwaway trees, and a module-level
 * array would carry one tree's registrations into the next.
 *
 * This is what makes the gate structural rather than a source scan. Which
 * function a closure calls is not visible on the `Command` object, so a test
 * could only grep for it — and a grep cannot tell a hand-rolled prompt that
 * happens to look right from one that is right. Registration is a fact ON the
 * object, and the only way to get it is to call {@link confirmable}.
 */
const CONFIRMABLE = new WeakSet<Command>();

/** True when this command's `--yes` was declared through {@link confirmable}. */
export function isConfirmable(command: Command): boolean {
  return CONFIRMABLE.has(command);
}

/**
 * Declare `--yes` on a destructive command. Use this instead of writing
 * `.option("--yes", ...)` by hand, so the description cannot drift and the gate
 * can see that the command has a confirmation at all.
 */
export function confirmable(command: Command): Command {
  command.option("--yes", YES_FLAG_DESCRIPTION);
  CONFIRMABLE.add(command);
  return command;
}

/**
 * The stream a QUESTION is written on.
 *
 * 🚨 IT IS NOT `process.stdout`, AND THIS IS THE OTHER HALF OF READING STDIN.
 * Deciding on stdin makes `nexus <destructive> > log` from a real keyboard ask
 * — correctly, because the operator is right there and can answer. Writing the
 * question on stdout then sends it into the log file, so the terminal shows
 * NOTHING while the process waits for a keystroke. To the operator that is
 * indistinguishable from the hang this whole change removes, and it appears in
 * exactly the case the change set out to support.
 *
 * A prompt is interaction, not output. stderr is where interaction goes: it is
 * unredirected in the common case, it is not the pipe a caller parses, and it
 * keeps a question out of a `--json` document by construction.
 *
 * stdout is used for the one combination where stderr cannot be seen and stdout
 * can. When neither is a terminal the choice cannot matter — `confirmDestructive`
 * has already refused before reaching here, and the local parsers that call this
 * refuse on the same test.
 */
export function promptStream(): NodeJS.WriteStream {
  return process.stdout.isTTY && !process.stderr.isTTY ? process.stdout : process.stderr;
}

/**
 * Write one line of the CONVERSATION — anything a person needs in order to
 * answer, or to understand the answer they just gave.
 *
 * 🚨 THE QUESTION IS NOT THE ONLY HALF THAT HAS TO BE VISIBLE. A spend gate
 * printed its cost-safety status and its message with `console.log` and asked
 * through {@link promptStream}: with stdout redirected the operator got a bare
 * "accept the additional spend? [y/N]" and none of the figures it refers to, and
 * on decline lost the re-run line as well. Splitting a dialogue across two
 * streams is the same defect as asking on the wrong one, one step later.
 *
 * The rule that decides which function to call: a RESULT goes to `console.log`,
 * because a caller parses it. A PROMPT, its preamble and its acknowledgement go
 * here, because a person reads them.
 */
export function promptLine(text = ""): void {
  promptStream().write(`${text}\n`);
}

/**
 * Ask before an irreversible action.
 *
 * Returns true only when the caller may proceed. On a refusal it has already
 * reported and set `process.exitCode`, so the caller returns without acting.
 */
export async function confirmDestructive(
  question: string,
  opts: { yes?: boolean; force?: boolean }
): Promise<boolean> {
  if (opts.yes || opts.force) return true;

  if (!process.stdin.isTTY) {
    // A REFUSAL, so it owes the caller a document. `console.error` + exit 1 left
    // stdout empty under --json, and this helper is shared — so the one defect
    // reached every destructive verb that routes through it, none of which the
    // driven scan can see (the argv synthesizer passes `--yes`, which is the
    // arm that returns early above).
    process.exitCode = refuse(
      `${question} — refusing without a terminal to ask.`,
      "Pass --yes to confirm in a script."
    );
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: promptStream() });
  let answer: string;
  try {
    answer = await rl.question(`${question} [y/N] `);
  } finally {
    // `finally`, not a close on the happy path: an interface left open holds
    // stdin and the process never exits, so a read error would hang the CLI
    // rather than report. Most hand-rolled sites in this package close on the
    // happy path only.
    rl.close();
  }

  if (answer.trim().toLowerCase() !== "y") {
    promptLine("Aborted.");
    return false;
  }
  return true;
}
