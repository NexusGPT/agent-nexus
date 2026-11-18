import { reportFailure } from "../../../errors";
import { color } from "../../../output";
import { askYesNo } from "../../../util/ask";
import { promptLine, promptStream } from "../../../util/confirm";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";

/**
 * Handle the soft-limit question. Returns true only when the caller
 * explicitly said yes and the deploy should be re-sent confirmed.
 *
 * Interactive: print the situation and ask y/N through {@link askYesNo}, which
 * is the same primitive `confirmDestructive` asks through.
 *
 * No terminal to ask (piped, CI): NEVER auto-confirm and never exit clean.
 * Refuse with a document naming the exact re-run with `--confirm-overage`, and
 * return false so the command exits non-zero — a scripted deploy that silently
 * stops while reporting success is the worst possible outcome for a spend gate.
 *
 * `--json` is NOT part of that test. It describes the OUTPUT, and stdin is the
 * only statement about who is answering — so `--json` at a terminal asks, like
 * every other confirmation in this binary.
 */
export async function confirmOverageInteractively(
  data: Extract<TriggerDeploymentResponse, { status: "confirmation_required" }>,
  rerun: string
): Promise<boolean> {
  // 🚨 A REFUSAL MUST NOT WEAR A SUCCESS SHAPE. This printed the raw
  // `confirmation_required` payload on stdout and the remedy on stderr, so a
  // script parsing stdout received a normal-looking deployment document for a
  // deploy that DID NOT HAPPEN. The exit code said 1 and the document said
  // nothing about failing — and the root epilogue promises the opposite:
  // "Under --json an error is a JSON document on STDOUT". The figures the
  // operator needs ride in the hint rather than in a second document, because
  // one run prints one document.
  //
  // ⚠️ THE NO-TERMINAL ARM REFUSES THROUGH THE SAME DOCUMENT, AND USED NOT TO.
  // It was a bare `console.error` printing the re-run and nothing else: no
  // `Error:` line, no code, nothing an operator could paste and nothing a
  // reader could tell from ordinary chatter. `confirmDestructive` answers "I
  // could not ask" with a document; so does this. Both arms are one branch now
  // because they are one answer — nobody said yes, so nothing was deployed.
  //
  // STDIN, not stdout, because that is the stream the answer arrives on.
  // Testing stdout refused an `apps deploy > log` typed at an operator's own
  // keyboard.
  //
  // 🚨 AND STDIN ALONE — `isJsonMode()` WAS A SECOND DISJUNCT HERE AND IT WAS
  // DRIFT. `confirmDestructive` gates on stdin alone; this file is the copy that
  // was kept for its re-run hint and then diverged, so `--json` at a terminal
  // refused a question a person was standing right there to answer, costing them
  // a whole re-run with `--confirm-overage` for nothing. The safety it looked
  // like it bought is already bought: the `!isTTY` arm below blocks every
  // scripted path, which is the one condition that guarantees nobody is present
  // to notice.
  //
  // ASKING CANNOT CORRUPT THE `--json` DOCUMENT, which is the only reason the
  // disjunct could have been load-bearing. `promptStream()` returns stdout ONLY
  // when stdout is a TTY and stderr is not — so every reachable case of the
  // question landing on stdout has stdout on a terminal, where nothing is
  // parsing it. A caller that parses stdout has a pipe or a file there, and the
  // question goes to stderr by construction. See `util/confirm.stream.ts`.
  if (!process.stdin.isTTY) {
    reportFailure(
      "remote-error",
      `Spend confirmation required — nothing was deployed. ${data.reason.message}`,
      `Cost-safety status: ${data.reason.costSafetyStatus}\n  Re-run confirmed:\n  ${rerun}`
    );
    return false;
  }

  // THE PREAMBLE GOES WHERE THE QUESTION GOES. These three lines are the
  // figures the y/N refers to; on `console.log` with stdout redirected the
  // operator is asked to accept a spend and shown none of it.
  promptLine(color.yellow("Spend confirmation required — nothing was deployed."));
  promptLine(`  Cost-safety status: ${data.reason.costSafetyStatus}`);
  promptLine(`  ${data.reason.message}`);

  // `askYesNo`, not a hand-rolled interface. This site closed on the happy path
  // only — so a read that threw held stdin and the process never exited — and
  // lower-cased without trimming, so `"y "` and a CRLF `"y\r"` were read as NO.
  if (!(await askYesNo("Deploy anyway and accept the additional spend?", promptStream()))) {
    promptLine("Aborted.");
    promptLine(color.dim(`Re-run confirmed:\n  ${rerun}`));
    return false;
  }
  return true;
}
