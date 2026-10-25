import { failure } from "../../../errors";
import type { RcloneBinary } from "../../../workspace-direct-mount/managed-rclone";
import { powerShellExe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import { runForAnswer } from "./win32-powershell";
import { windowsArgvLine } from "./windows-argv-line";

/**
 * How rclone starts on Windows, and why not through Node's `spawn` alone.
 *
 * A `detached` child has NO console (DETACHED_PROCESS). Every hour the AWS SDK
 * inside rclone runs `cmd.exe /C renew.cmd`, and a console program whose parent
 * has no console gets a NEW one: a black window flashes over whatever the user
 * is doing, at every key renewal and at the first read after a mount. Observed
 * on Windows 11 on 2026-10-20 — a Windows Terminal window titled cmd.exe, ~0.3 s.
 * A child that is NOT detached shares a hidden console (CREATE_NO_WINDOW), but
 * libuv puts it in a job with KILL_ON_JOB_CLOSE: it dies with this CLI.
 *
 * So Windows PowerShell starts rclone: PowerShell itself runs hidden and not
 * detached (it needs a console to start), `Start-Process` gives rclone that
 * hidden console — the renewal's cmd.exe then inherits it and opens nothing —
 * and libuv's job allows silent breakaway, so PowerShell's child is in no job
 * and outlives both PowerShell and this CLI. Verified the same day: no window
 * at the renewal, alive after the CLI exits, alive after its terminal closes.
 *
 * Every value reaches the script through the ENVIRONMENT, never spliced into
 * the line: PowerShell reads a typographic apostrophe (U+2019, what macOS types
 * into an org name) as a quote, so no quoting of a literal is safe. The script
 * removes the five variables before rclone starts, so rclone never sees them.
 * The answer comes back through a FILE, not a pipe: with a pipe, rclone would
 * inherit the handle and hold the call open for its whole life. PowerShell
 * itself watches the fail-fast window: a pid Windows reuses inside it cannot
 * fool a wait on the process handle the way it fools a liveness probe.
 */

/** The fail-fast window: a refused credential or a missing driver ends rclone inside it. */
export const START_WINDOW_MS = 2000;

/** The five variables the script reads, and removes before rclone starts. */
export const START_ENV = {
  exe: "NEXUS_RCLONE_START_EXE",
  args: "NEXUS_RCLONE_START_ARGS",
  cwd: "NEXUS_RCLONE_START_CWD",
  log: "NEXUS_RCLONE_START_LOG",
  result: "NEXUS_RCLONE_START_RESULT"
} as const;

/** The one PowerShell line, a constant: nothing of the mount is spliced into it. */
export const START_SCRIPT =
  `$s = @{ exe = $env:${START_ENV.exe}; args = $env:${START_ENV.args}; cwd = $env:${START_ENV.cwd}; ` +
  `log = $env:${START_ENV.log}; result = $env:${START_ENV.result} }; ` +
  `Remove-Item Env:${START_ENV.exe}, Env:${START_ENV.args}, Env:${START_ENV.cwd}, Env:${START_ENV.log}, Env:${START_ENV.result}; ` +
  "try { $p = Start-Process -FilePath $s.exe -ArgumentList $s.args -WorkingDirectory $s.cwd" +
  " -WindowStyle Hidden -RedirectStandardError $s.log -PassThru -ErrorAction Stop; $null = $p.Handle } " +
  "catch { Set-Content -LiteralPath $s.result -Value ('failed ' + $_.Exception.Message) -Encoding ascii; exit 0 }; " +
  // Written at once, so a PowerShell killed at its timeout still leaves the pid to end.
  "Set-Content -LiteralPath $s.result -Value ('pid ' + $p.Id) -Encoding ascii; " +
  `if ($p.WaitForExit(${String(START_WINDOW_MS)})) { Set-Content -LiteralPath $s.result -Value ('exited ' + $p.ExitCode) -Encoding ascii }`;

/** What the script wrote: rclone's pid, the code it ended with inside the window, or why it did not start. */
export type StartResult =
  | { readonly pid: number }
  | { readonly exited: number }
  | { readonly failed: string };

/** `pid 5588`, `exited 2` or `failed <reason>`, one line; anything else is null. */
export function parseStartResult(text: string): StartResult | null {
  const pid = /^pid ([1-9]\d*)\s*$/.exec(text);
  if (pid?.[1] !== undefined) return { pid: Number.parseInt(pid[1], 10) };
  const exited = /^exited (-?\d+)\s*$/.exec(text);
  if (exited?.[1] !== undefined) return { exited: Number.parseInt(exited[1], 10) };
  const failed = /^failed (\S[^\r\n]*)\s*$/.exec(text);
  return failed?.[1] === undefined ? null : { failed: failed[1] };
}

/**
 * Start rclone through PowerShell. The pid is rclone's own (what the registry
 * records and `unmount` ends). A start PowerShell could not make — not run,
 * killed at its timeout, a non-zero exit, no readable result — is a
 * `local-failed` refusal, after an rclone it may have left running is ended:
 * a mounted drive no row knows is worse than a mount to type again.
 */
export function startHidden(
  binary: RcloneBinary,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  logPath: string
): { pid: number | undefined; startFailure: string | null } {
  // Per CLI process: two mounts of one workspace at once must not read each other's answer.
  const resultPath = `${logPath}.${String(process.pid)}.start`;
  const { run: ran, answer: result } = runForAnswer(
    START_SCRIPT,
    {
      ...env,
      [START_ENV.exe]: binary,
      [START_ENV.args]: windowsArgvLine(args),
      [START_ENV.cwd]: cwd,
      [START_ENV.log]: logPath,
      [START_ENV.result]: resultPath
    },
    resultPath,
    parseStartResult
  );
  if (!ran.ran || ran.status !== 0 || result === null) {
    const stray = result !== null && "pid" in result;
    if (stray) endStray(result.pid);
    const what = ran.ran
      ? `exited ${String(ran.status)}`
      : "could not run, or was ended at its timeout,";
    throw failure(
      "local-failed",
      `Windows PowerShell (${powerShellExe(process.env)}) ${what} starting rclone; ${stray ? "the rclone it started was ended" : "no rclone pid was read"}.`,
      "The drive starts through PowerShell so that its hourly renewal opens no console window. Check that PowerShell runs on this machine, then mount again."
    );
  }
  if ("failed" in result)
    return { pid: undefined, startFailure: `Windows did not start rclone: ${result.failed}` };
  if ("exited" in result) {
    return {
      pid: undefined,
      startFailure: `rclone exited immediately (code ${String(result.exited)})`
    };
  }
  return { pid: result.pid, startFailure: null };
}

/** End an rclone that started but whose start this CLI must refuse; one that is already gone is fine. */
function endStray(pid: number): void {
  try {
    process.kill(pid);
  } catch {
    /* already gone, or not ours to end */
  }
}
