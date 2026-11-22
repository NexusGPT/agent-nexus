import { refuse } from "../errors";
import { askYesNo } from "./ask";
import { canAsk, promptLine, promptStream } from "./confirm.stream";

/**
 * Ask before an irreversible action.
 *
 * Returns true only when the caller may proceed. On a refusal it has already
 * reported and set `process.exitCode`, so the caller returns without acting.
 *
 * `rerun` is the exact command line that WOULD have worked, and it exists so a
 * per-command hint is no longer a reason to hand-roll the whole helper. `apps`
 * kept its own copy of this function for exactly that one line, and the copy
 * then drifted: it tested `isJsonMode()` as well as stdin, so `--json` at a
 * terminal refused a question a person was standing right there to answer.
 * Passing the line here gets the hint without a second implementation of the
 * rule — and the prompt already lands on stderr, so a `--json` run's stdout
 * stays one document either way.
 *
 * ── WHY THE GATE IS `canAsk()` AND NOT `process.stdin.isTTY` ────────────────
 *
 * A confirmation is a conversation, so it needs a stream in each direction, and
 * the stdin test covers one of them. `nexus <destructive> >out.log 2>err.log`
 * from a keyboard has a readable stdin and NO visible output stream: the stdin
 * test passed it through, the question went into err.log, and the process sat on
 * a keystroke nobody had been asked for. {@link canAsk} is both halves, so the
 * precondition is symmetric and neither direction can be forgotten here.
 *
 * REFUSING COSTS ONE RETRY AND THE OTHER TWO OPTIONS COST MORE, which is what
 * decides the direction. Hanging costs the operator a Ctrl-C and a CI job its
 * whole timeout, with no document and no exit code to read. Writing the question
 * to the controlling terminal instead would answer it on POSIX only — Windows
 * has no `/dev/tty`, so the hang would survive there and this refusal would have
 * to exist anyway — and it would split the dialogue, since a child process's
 * output still goes to the redirected descriptor.
 */
export async function confirmDestructive(
  question: string,
  opts: { yes?: boolean; force?: boolean; rerun?: string }
): Promise<boolean> {
  if (opts.yes || opts.force) return true;

  if (!canAsk()) {
    // A REFUSAL, so it owes the caller a document. `console.error` + exit 1 left
    // stdout empty under --json, and this helper is shared — so the one defect
    // reached every destructive verb that routes through it, none of which the
    // driven scan can see (the argv synthesizer passes `--yes`, which is the
    // arm that returns early above).
    //
    // The two causes get different sentences because they prescribe the same
    // remedy from different situations, and an operator who can see neither
    // stream reads this out of the file they redirected to. "No terminal" over a
    // run typed at a terminal would send them looking for the wrong thing.
    process.exitCode = refuse(
      process.stdin.isTTY === true
        ? `${question} — refusing with nowhere to show the question: stdout and stderr are both redirected.`
        : `${question} — refusing without a terminal to ask.`,
      opts.rerun === undefined
        ? "Pass --yes to confirm in a script."
        : `Re-run with --yes:  ${opts.rerun}`
    );
    return false;
  }

  // `askYesNo` owns the interface's lifetime and the answer's normalisation, so
  // neither can drift per call site. It closes in a `finally` — an interface
  // left open holds stdin and the process never exits, so a read error would
  // hang the CLI rather than report — and it trims, so `"y "` and a CRLF `"y\r"`
  // are the yes they were typed as. See `./ask`.
  if (!(await askYesNo(question, promptStream()))) {
    promptLine("Aborted.");
    return false;
  }
  return true;
}
