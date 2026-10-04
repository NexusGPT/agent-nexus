import type { WaitForThreadResult } from "@agent-nexus/sdk";

import { reportFailure } from "../../../errors";

/**
 * The verdict a wait ends on, as an exit code.
 *
 * ⚠️ A TIMEOUT AND A FAILURE BOTH EXIT NON-ZERO, and that is the point of the
 * flag. NEX-2923 was filed because a caller read "the command returned" as "the
 * prompt is ready" while the thread was still generating. Exiting 0 with a
 * `generating` status reproduces exactly that, one layer down.
 *
 * `resumeCommand` is the WHOLE command that continues this wait, flags included,
 * and it is passed in rather than rebuilt here because only the call site knows
 * what the caller typed. Two ways a hint goes wrong, and both have shipped:
 * naming the other verb (sending an `await-thread` user to `get-thread --wait`
 * hands them back the client-side poll they chose the server-held one to
 * avoid), and dropping `--after-message-count` — a wait with no turn declared
 * ends on the STATUS alone, so it cannot end on the assistant's reply and burns
 * its whole budget on a turn that answers with prose and generates nothing.
 *
 * That second hint used to be about a STALE verdict, and it no longer is: the
 * server clears a terminal status when it accepts a turn (NEX-4782 / NEX-4783),
 * so a finished thread reads `in_progress` for as long as the new turn is live
 * and there is no previous verdict left to return. What the flag still buys is
 * the reply exit, which is the only exit a prose-only turn ever reaches.
 */
export function waitExitCode(
  result: WaitForThreadResult,
  threadId: string,
  resumeCommand = `nexus prompt-assistant get-thread ${threadId} --wait`
): number {
  if (result.outcome === "timed-out") {
    const resume = resumeCommand;
    return reportFailure(
      "timed-out",
      `Still ${result.thread.status} after ${Math.round(result.waitedMs / 1000)}s — the CLI stopped waiting, the server did not stop working.`,
      `Resume with "${resume}". Do NOT resend the message: a resend is a second user turn.`
    );
  }
  // `outcome`, not `status`: a thread carries the PREVIOUS turn's terminal
  // status until this turn produces its own, and reporting that as this
  // invocation's failure fails a retry that actually worked.
  if (
    result.outcome === "terminal" &&
    (result.thread.status === "failed" || result.thread.status === "cancelled")
  ) {
    return reportFailure(
      "remote-error",
      `Thread ${result.thread.status} — no prompt was produced.`,
      'Read the last assistant message for the reason, then start a new thread with "nexus prompt-assistant chat".'
    );
  }
  return 0;
}
