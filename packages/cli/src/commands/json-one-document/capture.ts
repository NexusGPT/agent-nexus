import { setJsonMode } from "../../output";
import { ProcessExitCalled } from "./drive-deps";

/**
 * Patch every stream this scan reads, and hand back the one call that undoes it.
 *
 * 🔴 CALL THIS *AFTER* `buildProgram()`, NEVER BEFORE. The original `driveOne`
 * built the program and wired commander's own output BEFORE patching `console`,
 * so anything the build itself printed went to the real stream and stayed out of
 * the measurement. Patching first would fold it into `chunks` and the scan would
 * report its own harness.
 *
 * `restore` is the whole of the original `finally` block, in its order, so a
 * throw cannot leak a patched console into the next of five hundred runs.
 */
export function patchStreams(chunks: string[], captureErr: (text: string) => void): () => void {
  const realLog = console.log;
  const realErr = console.error;
  const realWrite = process.stdout.write.bind(process.stdout);
  const realErrWrite = process.stderr.write.bind(process.stderr);
  console.log = (...args: unknown[]): void => void chunks.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => captureErr(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    chunks.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    captureErr(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stderr.write;

  // `--help` and `--version` reach commander's `_exit` with code 0, where the
  // production callback deliberately returns and lets `process.exit(0)` run.
  // A real exit here would take the whole test worker with it, so it becomes a
  // throw for the duration of one driven command — the ONLY production
  // behaviour this scan alters, and it alters it outside the code under test.
  const realExit = process.exit;
  process.exit = ((code?: number): never => {
    throw new ProcessExitCalled(code ?? 0);
  }) as typeof process.exit;

  return (): void => {
    console.log = realLog;
    console.error = realErr;
    process.stdout.write = realWrite;
    process.stderr.write = realErrWrite;
    process.exit = realExit;
    // A RESET, not the other half of a pair. One `nexus` process runs one
    // command; this one runs five hundred, so the flag the program may have set
    // has to be cleared before the next leaf is driven, or run N+1 inherits run
    // N's mode and the scan measures a state no caller can produce.
    setJsonMode(false);
  };
}
