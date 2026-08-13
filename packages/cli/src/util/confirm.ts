import { Command } from "commander";

import { color } from "../output";

/**
 * ONE ANSWER TO "NO TERMINAL, NO --yes": REFUSE.
 *
 * ── What was here before ─────────────────────────────────────────────────────
 *
 * Six behaviours behind one flag name, and a reader's mental model came from
 * whichever command they had read last:
 *
 *   1. refuse on a non-TTY                      — `claude-code install`
 *   2. proceed silently, gated on `stdin`       — `tool delete-credential`
 *   3. proceed silently, gated on `stdout`      — `task-eval session delete`
 *   4. exit 1 having done nothing               — `phone-number buy` / `release`
 *   5. no gate at all                           — `document`/`folder`/`version delete`
 *   6. no gate and no flag                      — `api`
 *
 * 2 and 3 are the dangerous ones. A destructive verb run from a script deletes
 * with no prompt, no warning and a success envelope — and a script is precisely
 * the place where nobody is watching.
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
 * terminal", which is a different question, and the codebase answered it 37
 * times against 6 for stdin. Two consequences of the wrong stream, both live:
 *
 *   - `nexus <destructive> > log.txt` — stdout is a pipe, stdin is still the
 *     operator's terminal. The stdout form skips the prompt entirely. On the
 *     `proceed` variants that is a silent delete from an interactive session.
 *   - `echo y | nexus <destructive>` — stdin is a pipe, stdout is still a
 *     terminal. The stdout form prompts and consumes the piped `y`, which is
 *     the answer arriving from a script rather than a person.
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
    console.error(
      `${color.red("Error:")} ${question} — refusing without a terminal to ask. ` +
        `Pass --yes to confirm in a script.`
    );
    process.exitCode = 1;
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
    console.log("Aborted.");
    return false;
  }
  return true;
}
