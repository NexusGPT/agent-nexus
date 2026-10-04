import { handleError } from "../../errors";
import { patchStreams } from "./capture";
import {
  captureCommanderOutput,
  type DriveDeps,
  ProcessExitCalled,
  RUN_BUDGET_MS
} from "./drive-deps";

/**
 * Run one command with every stream captured and `process.exit` neutralised.
 *
 * Lifted out of `driveOne` when this scan was split: the classification beside
 * it is a different concern, and the whole was 220 lines against an 80-line cap.
 * The body is unchanged, INCLUDING the two orderings its own comments call out —
 * `process.exitCode` is read before the outer value is restored, and the streams
 * are restored in a `finally` so a throw cannot leak a patched console.
 *
 * ── WHY NOTHING HERE CALLS `setJsonMode(true)` ──────────────────────────────
 * 🚨 THE HARNESS DOES NOT ENTER JSON MODE. THE PROGRAM DOES, OR NOTHING DOES.
 *
 * This line used to read `setJsonMode(true)`, and that one statement put the
 * whole PRE-HOOK half of the contract out of the gate's reach. JSON mode is
 * decided in the root's `preAction` hook, and commander refuses an invalid
 * invocation ABOVE the hook chain — so in production a refusal happens while
 * the process still believes it is in text mode, and `printCliError` writes
 * prose to stderr with nothing on stdout. A harness that flipped the flag
 * itself was testing a world where that is impossible: every commander
 * refusal came back as a compliant `error-document` and both ledgers read
 * ZERO over a defect reproducible from the shipped binary in one command.
 *
 * So the mode is now an OUTPUT of the run rather than an input to it. `--json`
 * rides in argv exactly as a caller types it, and whether the process notices
 * is precisely what this scan measures.
 */
export async function runInSandbox(
  argv: readonly string[],
  deps: DriveDeps
): Promise<{
  stdout: string;
  stderr: string;
  runExitCode: number | string | undefined;
  timedOut: boolean;
  threw: unknown;
}> {
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const captureErr = (text: string): void => void errChunks.push(text.replace(/\n$/, ""));

  const program = deps.buildProgram();
  captureCommanderOutput(program, captureErr);

  const restore = patchStreams(chunks, captureErr);
  deps.resetRequests();
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let timedOut = false;
  let threw: unknown;
  try {
    await Promise.race([
      program.parseAsync(["node", "nexus", "--json", ...argv]),
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, RUN_BUDGET_MS);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    // Every failure shape is DATA here — a commander refusal, a thrown SDK stub,
    // a command that rejects its own placeholder. What each STREAM holds is the
    // measurement, and the classification below reads it either way.
    //
    // 🚨 `handleError` IS CALLED HERE BECAUSE THE ENTRY POINT CALLS IT. `index.ts`
    // ends with `.catch((err) => { process.exitCode = handleError(err); })`, and
    // that line is where an argument refusal becomes its document. A scan that
    // skipped it would drive the parser and never exercise the reporter, and
    // would report every refusal as an empty stdout forever.
    threw = error;
    // 🚨 A `process.exit` IS NOT AN ERROR THE ENTRY POINT EVER SEES. Feeding it
    // to `handleError` would manufacture an error document that production
    // never produces — and that is not hypothetical: with the neutraliser
    // reporting a plain Error, deleting the refusal funnel from
    // `buildRootProgram` left the ledger GREEN while 41 commands went back to an
    // empty stdout. The exit is recorded as the fact it is, and the run keeps
    // whatever the command really put on each stream.
    if (!(error instanceof ProcessExitCalled)) {
      process.exitCode = handleError(error);
    } else {
      process.exitCode = error.code === 0 ? undefined : error.code;
    }
  } finally {
    restore();
  }

  // 🚨 READ IT BEFORE RESTORING IT. `process.exitCode` is how nine out of ten
  // commands report a refusal — they never throw — so restoring the outer value
  // first would erase the only signal that the run failed at all.
  const runExitCode = process.exitCode;
  process.exitCode = previousExitCode;

  const stdout = chunks.join("\n");
  const stderr = errChunks.join("\n").trim();

  return { stdout, stderr, runExitCode, timedOut, threw };
}
