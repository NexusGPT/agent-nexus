import { CliArgumentError, handleError } from "../errors";
import { setJsonMode } from "../output";
import type { CandidateDeps, CandidateRun } from "./destructive-confirmation.candidate-run";

const RUN_BUDGET_MS = 8_000;

class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitCalled";
  }
}

/** Every stream and exit this process owns, captured so one drive cannot leak. */
interface Captured {
  readonly errChunks: string[];
  readonly restore: () => void;
}

/**
 * Silence stdout, collect stderr, and make `process.exit` throw.
 *
 * `process.exit` has to throw rather than exit: a driven command that calls it
 * would otherwise take the whole vitest worker with it, and the exit CODE is
 * one of the facts a run is measured on.
 */
function captureProcess(): Captured {
  const errChunks: string[] = [];
  const realLog = console.log;
  const realErr = console.error;
  const realWrite = process.stdout.write.bind(process.stdout);
  const realErrWrite = process.stderr.write.bind(process.stderr);
  const realExit = process.exit;

  console.log = (): void => {};
  console.error = (...args: unknown[]): void => void errChunks.push(args.map(String).join(" "));
  process.stdout.write = ((): boolean => true) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    errChunks.push(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number): never => {
    throw new ProcessExitCalled(code ?? 0);
  }) as typeof process.exit;

  return {
    errChunks,
    restore: () => {
      console.log = realLog;
      console.error = realErr;
      process.stdout.write = realWrite;
      process.stderr.write = realErrWrite;
      process.exit = realExit;
      // A RESET, not the other half of a pair: one `nexus` process runs one
      // command and this runs sixty, so a mode the program set must not reach
      // the next leaf.
      setJsonMode(false);
    }
  };
}

/** Drive ONE candidate to completion and report what it did. */
export async function driveOne(
  leaf: string,
  argv: readonly string[],
  deps: CandidateDeps
): Promise<CandidateRun> {
  const program = deps.buildProgram();
  const captured = captureProcess();

  deps.reset();
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let timedOut = false;
  let threw: unknown;
  try {
    await Promise.race([
      program.parseAsync(["node", "nexus", ...argv]),
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, RUN_BUDGET_MS);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    threw = error;
    // The entry point ends with `.catch(err => { process.exitCode = handleError(err) })`,
    // so a scan that skipped it would drive the parser and never exercise the
    // reporter. A `process.exit` is not an error the entry point ever sees.
    if (!(error instanceof ProcessExitCalled)) {
      process.exitCode = handleError(error);
    } else {
      process.exitCode = error.code === 0 ? undefined : error.code;
    }
  } finally {
    captured.restore();
  }

  // Read it BEFORE restoring: `process.exitCode` is how most commands report a
  // refusal, so restoring the outer value first erases the only signal.
  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;

  return {
    leaf,
    argv,
    asked: deps.wasAsked(),
    requests: deps.requestCount(),
    exitCode: typeof exitCode === "number" ? exitCode : undefined,
    refusedByCommander: threw instanceof CliArgumentError,
    stderr: captured.errChunks.join("\n").trim(),
    timedOut
  };
}
