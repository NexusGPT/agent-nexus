import { refuse } from "../errors";
import { askYesNo } from "./ask";
import { promptLine, promptStream } from "./confirm.stream";

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
 */
export async function confirmDestructive(
  question: string,
  opts: { yes?: boolean; force?: boolean; rerun?: string }
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
