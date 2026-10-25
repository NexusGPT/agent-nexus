import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { powerShellExe } from "../../../workspace-direct-mount/win32/win32-system-exe";

/**
 * The one PowerShell reader every Windows probe goes through: the liveness
 * command line, the UAC policy, and the WinFsp registry key. One invocation
 * shape — PowerShell by its full address, no profile, no prompt, UTF-8 out so
 * a path with non-ASCII letters survives, a bounded wait, its own hidden
 * console so the code page it sets is not the caller's terminal's — and one
 * fake in the specs, keyed on that address.
 *
 * Only `execFileSync` is used on the whole mount path: the driven specs'
 * `node:child_process` fakes expose nothing else.
 */

/**
 * A cold PowerShell start plus one WMI or registry read, with room for a slow
 * disk; past it, a stalled WMI would hang `status`, `unmount` and `mount`.
 */
export const POWERSHELL_TIMEOUT_MS = 20_000;

const UTF8_OUT = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); ";

/** The argv for one script, pure: the script is the only spliced value. */
export function powerShellArgv(script: string): readonly string[] {
  return ["-NoProfile", "-NonInteractive", "-Command", `${UTF8_OUT}${script}`];
}

/**
 * What a script printed, or `null` when it could not be read: PowerShell
 * missing or refused (ENOENT, EACCES), killed at the timeout, or exiting
 * non-zero. "I could not read it" is a different answer from `""`, a script
 * that ran and printed nothing.
 */
export function readPowerShell(script: string): string | null {
  try {
    return execFileSync(powerShellExe(process.env), [...powerShellArgv(script)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true
    });
  } catch {
    return null;
  }
}

/** What running a script for its effects came to: `ran: false` for PowerShell missing, refused or killed at the timeout, else its exit status. */
export type PowerShellRun =
  | { readonly ran: true; readonly status: number }
  | { readonly ran: false };

/**
 * Run a script for its side effects, under `env`, with NO pipes: a process the
 * script starts inherits every inheritable handle, and a pipe among them would
 * hold this call open for that process's whole life. Same address, same argv,
 * same hidden console and bound wait as the reader.
 */
export function runPowerShell(script: string, env: NodeJS.ProcessEnv): PowerShellRun {
  try {
    execFileSync(powerShellExe(process.env), [...powerShellArgv(script)], {
      env,
      stdio: "ignore",
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true
    });
    return { ran: true, status: 0 };
  } catch (error) {
    const status = statusOf(error);
    return status === null ? { ran: false } : { ran: true, status };
  }
}

/**
 * Run a script that answers through a FILE (a pipe would be inherited by a
 * process it starts): the file is cleared first, so a stale answer is never
 * read as this run's, then read, parsed and removed. `null` for no answer.
 */
export function runForAnswer<T>(
  script: string,
  env: NodeJS.ProcessEnv,
  answerFile: string,
  parse: (text: string) => T | null
): { readonly run: PowerShellRun; readonly answer: T | null } {
  fs.rmSync(answerFile, { force: true });
  const run = runPowerShell(script, env);
  let text: string | null = null;
  try {
    text = fs.readFileSync(answerFile, "utf-8");
  } catch {
    /* no answer was written */
  }
  fs.rmSync(answerFile, { force: true });
  return { run, answer: text === null ? null : parse(text) };
}

/** PowerShell's exit status from an `execFileSync` throw, or null when it never ran or was killed at the timeout. */
function statusOf(error: unknown): number | null {
  const status = error instanceof Error && "status" in error ? error.status : undefined;
  return typeof status === "number" ? status : null;
}
