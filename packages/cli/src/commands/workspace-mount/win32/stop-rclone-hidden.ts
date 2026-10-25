import os from "node:os";
import path from "node:path";

import { runForAnswer } from "./win32-powershell";

/**
 * How `unmount` stops rclone on Windows, and why not with TerminateProcess
 * alone.
 *
 * WinFsp releases the drive letter or folder when rclone ends, either way. But
 * it tells the shell only when rclone unmounts by itself: after a kill,
 * Explorer's "This PC" keeps a dead drive that opens to "Location is not
 * available" until the window is refreshed; after an rclone that exited on its
 * own, the drive vanishes at once. Observed on Windows 11 on 2026-10-21, with
 * the kill as the positive control.
 *
 * rclone exits cleanly on Ctrl-C, and the hidden PowerShell start
 * (`start-rclone-hidden.ts`) gave it a console to receive one in. Nobody
 * presses a key: the script attaches this PowerShell to that console
 * (`FreeConsole` first — a process may hold one console at a time), tells
 * itself to ignore the event, and raises it with `GenerateConsoleCtrlEvent`
 * for every process on that console — rclone, and at most the `cmd.exe` of a
 * renewal in flight. The user's own terminal is a different console and sees
 * nothing. The process found at the pid must be named rclone, and a handle to
 * it is opened at once, so Windows cannot reissue the pid to a stranger between
 * that check and the event; the wait is on that same handle. An rclone from a
 * version that started it detached has no console to attach to: the answer is
 * `no console`, and the caller kills it as before.
 *
 * The four kernel32 calls are bound through Reflection.Emit, not `Add-Type`:
 * the C# compiler `Add-Type` runs took 7 to 10 s per unmount on a Windows 11
 * VM (measured 2026-10-21, against 5 s for a PowerShell that compiles nothing),
 * and it leaves no assembly on disk to swap. The values reach the script
 * through the environment and the answer comes back through a file, as the
 * start does: no quoting of a path, no pipe for a process to inherit.
 */

/** How long rclone has to unmount and exit after the event before it is killed instead. Seen: under 400 ms. */
export const STOP_WINDOW_MS = 5000;

/** The two variables the script reads. */
export const STOP_ENV = {
  pid: "NEXUS_RCLONE_STOP_PID",
  result: "NEXUS_RCLONE_STOP_RESULT"
} as const;

/** The four kernel32 calls, bound at run time as P/Invoke stubs on a dynamic type `$k`. */
const BIND_CONSOLE_SIGNAL =
  "$d = [AppDomain]::CurrentDomain.DefineDynamicAssembly((New-Object Reflection.AssemblyName 'NexusConsoleSignal'), 'Run')" +
  ".DefineDynamicModule('NexusConsoleSignal', $false).DefineType('ConsoleSignal', 'Public, Class'); " +
  "foreach ($f in @(@('FreeConsole', @()), @('AttachConsole', @([uint32])), @('SetConsoleCtrlHandler', @([IntPtr], [bool])), " +
  "@('GenerateConsoleCtrlEvent', @([uint32], [uint32])))) { " +
  "$m = $d.DefinePInvokeMethod($f[0], 'kernel32.dll', 'Public, Static, PinvokeImpl', 'Standard', [bool], [Type[]]$f[1], 'Winapi', 'Auto'); " +
  "$m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig) }; " +
  "$k = $d.CreateType(); ";

/**
 * The one PowerShell line, a constant. `exited` is written for an rclone that
 * ended inside the window AND for one already gone before the event — or for a
 * pid that some other program holds by now: in all three the recorded rclone is
 * nobody's to signal any more. `killed` is one still running after the window,
 * or with no console to be told through, ended through the handle held since
 * the name check — never by a bare pid another program may hold by then.
 */
export const STOP_SCRIPT =
  `$s = @{ pid = [int]$env:${STOP_ENV.pid}; result = $env:${STOP_ENV.result} }; ` +
  BIND_CONSOLE_SIGNAL +
  "try { $p = Get-Process -Id $s.pid -ErrorAction Stop; $null = $p.Handle; $r = 'alive' } catch { $r = 'exited' }; " +
  "if ($p.ProcessName -ne 'rclone') { $r = 'exited' }; " +
  "if ($r -eq 'alive') { [void]$k::FreeConsole(); " +
  "if ($k::AttachConsole([uint32]$s.pid)) { [void]$k::SetConsoleCtrlHandler([IntPtr]::Zero, $true); " +
  "$sent = $k::GenerateConsoleCtrlEvent(0, 0); [void]$k::FreeConsole(); " +
  `if ($sent -and $p.WaitForExit(${String(STOP_WINDOW_MS)})) { $r = 'exited' } } else { $r = 'no console' } }; ` +
  "if ($r -ne 'exited') { try { $p.Kill(); [void]$p.WaitForExit(5000); $r = 'killed' } catch { $r = 'exited' } }; " +
  "Set-Content -LiteralPath $s.result -Value $r -Encoding ascii";

/** What the script wrote: rclone closed itself (or is gone), or it had to be ended. */
export type StopResult = "exited" | "killed";

/** One of the two words on one line; anything else is null. */
export function parseStopResult(text: string): StopResult | null {
  const line = text.trim();
  return line === "exited" || line === "killed" ? line : null;
}

/**
 * Tell the rclone at `pid` to exit, and say what became of it. `null` is a
 * PowerShell that could not run, was ended at its timeout, exited non-zero or
 * left no readable answer: nothing is known, and the caller falls back to the
 * kill it would have sent anyway. A pid that is not a positive whole number is
 * a corrupt registry row the caller should have refused; it never reaches a
 * shell.
 */
export function stopHidden(pid: number): StopResult | null {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`not a pid: ${String(pid)}`);
  // Per CLI process: two unmounts at once must not read each other's answer.
  const resultPath = path.join(os.tmpdir(), `nexus-rclone-stop.${String(process.pid)}.txt`);
  const env = { ...process.env, [STOP_ENV.pid]: String(pid), [STOP_ENV.result]: resultPath };
  const { run, answer } = runForAnswer(STOP_SCRIPT, env, resultPath, parseStopResult);
  return run.ran && run.status === 0 ? answer : null;
}
