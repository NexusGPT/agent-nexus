import { reportFailure } from "../../../errors";
import { color } from "../../../output";
import { askYesNo } from "../../../util/ask";
import { canAsk, promptLine, promptStream } from "../../../util/confirm";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";

/**
 * Handle the soft-limit question. Returns true only when the caller
 * explicitly said yes and the deploy should be re-sent confirmed.
 *
 * Interactive: print the situation and ask y/N through {@link askYesNo}, which
 * is the same primitive `confirmDestructive` asks through.
 *
 * Nowhere to hold the conversation (piped, CI, both outputs redirected): NEVER
 * auto-confirm and never exit clean. Refuse with a document naming the exact
 * re-run with `--confirm-overage`, and return false so the command exits
 * non-zero — a scripted deploy that silently stops while reporting success is
 * the worst possible outcome for a spend gate.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE GATE IS `canAsk()`, AND BOTH NARROWER SPELLINGS LEFT A DEFECT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * stdin says whether an ANSWER can arrive; it is silent on whether the QUESTION
 * can be read. `apps deploy >out.log 2>err.log` typed at a real keyboard passes
 * a gate on `process.stdin.isTTY`; {@link promptStream} then resolves to
 * err.log, and the operator watches a blank terminal while the process blocks on
 * a keystroke nobody was asked for — on a SPEND gate, where the entire purpose
 * is to refuse safely. In CI it burns to the job timeout with no document and no
 * exit code to read.
 *
 * Gating on STDOUT is the opposite error, and was the state before that: it
 * refused an `apps deploy > log` typed at an operator's own keyboard, who could
 * have answered.
 *
 * {@link canAsk} is both halves in one answer, so the ask is unreachable in
 * exactly the case where the question would be invisible, and the refusal lands
 * in the file the operator redirected to. `util/confirm.stream.ts` owns the
 * reasoning; this file is one of its callers and owes it the same test every
 * other ask site in this binary does.
 *
 * `--json` is NOT part of that test. It describes the OUTPUT, and only the
 * streams say whether anyone can be asked — so `--json` at a terminal asks,
 * like every other confirmation in this binary.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE DOCUMENT'S `code` AND THE PROCESS'S STATUS ARE ONE DECISION, AND THIS
 *    FILE USED TO MAKE IT TWICE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `reportFailure` resolves `remote-error` to `CLI_REMOTE_ERROR` in the document
 * AND returns 6 for the status, from one lookup pair. That return value was
 * DISCARDED here, while `deploy/deploy.command.ts` and
 * `deploy/redeploy-sha.handler.ts` each assigned a bare `process.exitCode = 1`
 * instead — so one output answered a scripted consumer two contradictory ways.
 *
 * The disagreement is load-bearing in the worst direction. `1` is `failed`, so
 * a caller reading only the status was told a generic failure where the
 * document said *the request was accepted and the server answered* — which is
 * retryable the moment the organization's spend period resets.
 *
 * Assigning it HERE is `confirmDestructive`'s shape (`util/confirm.destructive.ts`:
 * "On a refusal it has already reported and set `process.exitCode`, so the
 * caller returns without acting"). The code travels with the document that
 * names it, so the two cannot be decided apart again. Both callers now write
 * `process.exitCode ??= EXIT_CODES.failed`, which preserves whatever an arm
 * set and still grades the DECLINED arm below, which deliberately sets none.
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
  // 🚨 `canAsk()`, NEVER `process.stdin.isTTY` — the header owns why, and the
  // short version is that a stdin gate leaves a hang here.
  //
  // 🚨 AND NOT `isJsonMode()` — IT WAS A SECOND DISJUNCT HERE AND IT WAS DRIFT.
  // `confirmDestructive` gates on `canAsk()` alone; this file is the copy that
  // was kept for its re-run hint and then diverged, so `--json` at a terminal
  // refused a question a person was standing right there to answer, costing them
  // a whole re-run with `--confirm-overage` for nothing. The safety it looked
  // like it bought is already bought: the arm below blocks every scripted path,
  // which is the one condition that guarantees nobody is present to notice.
  //
  // ASKING CANNOT CORRUPT THE `--json` DOCUMENT, which is the only reason the
  // disjunct could have been load-bearing. `promptStream()` returns stdout ONLY
  // when stdout is a TTY and stderr is not — so every reachable case of the
  // question landing on stdout has stdout on a terminal, where nothing is
  // parsing it. A caller that parses stdout has a pipe or a file there, and the
  // question goes to stderr by construction. See `util/confirm.stream.ts`.
  if (!canAsk()) {
    // ASSIGNED, never discarded — the header owns why. This verb decides the
    // document's `code` and the exit status together; dropping the return value
    // is what let a caller publish `CLI_REMOTE_ERROR` beside a bare `1`.
    process.exitCode = reportFailure(
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
  // DECLINED SETS NO EXIT CODE, DELIBERATELY: there is no error document here to
  // disagree with, so the caller's `failed` backstop grades it. See the header.
  if (!(await askYesNo("Deploy anyway and accept the additional spend?", promptStream()))) {
    promptLine("Aborted.");
    promptLine(color.dim(`Re-run confirmed:\n  ${rerun}`));
    return false;
  }
  return true;
}
