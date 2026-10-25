import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { powerShellExe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import {
  parseStopResult,
  STOP_ENV,
  STOP_SCRIPT,
  STOP_WINDOW_MS,
  stopHidden
} from "./stop-rclone-hidden";
import { powerShellArgv } from "./win32-powershell";

const execFileSync =
  vi.fn<(command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => string>();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) =>
    execFileSync(...(args as [string, string[], { env: NodeJS.ProcessEnv }]))
}));

const RESULT = path.join(os.tmpdir(), `nexus-rclone-stop.${String(process.pid)}.txt`);

/** What PowerShell leaves when the script ran: the one-line answer in the file the env names. */
function powerShellLeaves(resultText: string, status = 0): void {
  execFileSync.mockImplementation((_command, _args, options) => {
    const resultPath = options.env[STOP_ENV.result];
    if (resultPath === undefined) throw new Error("the stop was given no result path");
    fs.writeFileSync(resultPath, resultText);
    if (status !== 0) throw Object.assign(new Error("Command failed"), { status });
    return "";
  });
}

beforeEach(() => {
  execFileSync.mockReset();
  fs.rmSync(RESULT, { force: true });
});
afterEach(() => fs.rmSync(RESULT, { force: true }));

describe("STOP_SCRIPT — one constant line, the pid and the result path from the environment", () => {
  it("binds the four kernel32 calls without a compiler, pins the process it found by name and handle, frees its console, attaches to rclone's, ignores the event itself, raises Ctrl-C, waits the window on that handle, and writes one word", () => {
    expect(STOP_SCRIPT).toBe(
      "$s = @{ pid = [int]$env:NEXUS_RCLONE_STOP_PID; result = $env:NEXUS_RCLONE_STOP_RESULT }; " +
        "$d = [AppDomain]::CurrentDomain.DefineDynamicAssembly((New-Object Reflection.AssemblyName 'NexusConsoleSignal'), 'Run')" +
        ".DefineDynamicModule('NexusConsoleSignal', $false).DefineType('ConsoleSignal', 'Public, Class'); " +
        "foreach ($f in @(@('FreeConsole', @()), @('AttachConsole', @([uint32])), @('SetConsoleCtrlHandler', @([IntPtr], [bool])), " +
        "@('GenerateConsoleCtrlEvent', @([uint32], [uint32])))) { " +
        "$m = $d.DefinePInvokeMethod($f[0], 'kernel32.dll', 'Public, Static, PinvokeImpl', 'Standard', [bool], [Type[]]$f[1], 'Winapi', 'Auto'); " +
        "$m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig) }; " +
        "$k = $d.CreateType(); " +
        "try { $p = Get-Process -Id $s.pid -ErrorAction Stop; $null = $p.Handle; $r = 'alive' } catch { $r = 'exited' }; " +
        "if ($p.ProcessName -ne 'rclone') { $r = 'exited' }; " +
        "if ($r -eq 'alive') { [void]$k::FreeConsole(); " +
        "if ($k::AttachConsole([uint32]$s.pid)) { [void]$k::SetConsoleCtrlHandler([IntPtr]::Zero, $true); " +
        "$sent = $k::GenerateConsoleCtrlEvent(0, 0); [void]$k::FreeConsole(); " +
        "if ($sent -and $p.WaitForExit(5000)) { $r = 'exited' } } else { $r = 'no console' } }; " +
        "if ($r -ne 'exited') { try { $p.Kill(); [void]$p.WaitForExit(5000); $r = 'killed' } catch { $r = 'exited' } }; " +
        "Set-Content -LiteralPath $s.result -Value $r -Encoding ascii"
    );
    expect(STOP_WINDOW_MS).toBe(5000);
  });

  it("pins the process by handle and checks its name before attaching, frees its own console before attaching, ignores the event before raising it, and raises it before the wait", () => {
    const pinned = STOP_SCRIPT.indexOf("$null = $p.Handle");
    const named = STOP_SCRIPT.indexOf("if ($p.ProcessName -ne 'rclone') { $r = 'exited' }");
    const freed = STOP_SCRIPT.indexOf("$k::FreeConsole()");
    const attached = STOP_SCRIPT.indexOf("$k::AttachConsole(");
    const ignored = STOP_SCRIPT.indexOf("$k::SetConsoleCtrlHandler([IntPtr]::Zero, $true)");
    const raised = STOP_SCRIPT.indexOf("$k::GenerateConsoleCtrlEvent(0, 0)");
    const waited = STOP_SCRIPT.indexOf(".WaitForExit(");
    expect(pinned).toBeGreaterThan(-1);
    expect(pinned).toBeLessThan(named);
    expect(named).toBeLessThan(freed);
    expect(freed).toBeLessThan(attached);
    expect(attached).toBeLessThan(ignored);
    expect(ignored).toBeLessThan(raised);
    expect(raised).toBeLessThan(waited);
  });

  it("ends rclone only through the held handle, after the ask; compiles nothing; splices no path or double quote", () => {
    expect(STOP_SCRIPT).not.toMatch(/Stop-Process|taskkill|TerminateProcess/);
    expect(STOP_SCRIPT.indexOf("$p.Kill()")).toBeGreaterThan(STOP_SCRIPT.indexOf(".WaitForExit("));
    // A compiler run cost 7 to 10 s per unmount; the stubs are emitted instead.
    expect(STOP_SCRIPT).not.toContain("Add-Type");
    // The result file's name reaches it through the environment; no quoting of a value is needed.
    expect(STOP_SCRIPT).not.toContain("'C:");
    expect(STOP_SCRIPT).not.toContain(os.tmpdir());
    expect(STOP_SCRIPT).not.toContain('"');
  });
});

describe("parseStopResult — one of two words, nothing else", () => {
  it.each([
    ["exited\r\n", "exited"],
    ["killed\r\n", "killed"],
    ["exited", "exited"],
    ["alive\r\n", null],
    ["exited 0\r\n", null],
    ["Exited\r\n", null],
    ["killed\r\nWARNING: something else\r\n", null],
    ["Add-Type : Cannot add type\r\n", null],
    ["", null]
  ])("%j → %j", (text, parsed) => {
    expect(parseStopResult(text)).toBe(parsed);
  });
});

describe("stopHidden — PowerShell tells rclone, the answer comes back through the file", () => {
  it("runs the stop script with the pid and the result path in the environment, no pipes; reads the word; removes the file", () => {
    powerShellLeaves("exited\r\n");

    expect(stopHidden(5588)).toBe("exited");
    expect(fs.existsSync(RESULT)).toBe(false);
    const [command, argv, options] = execFileSync.mock.calls[0] ?? [];
    expect(command).toBe(powerShellExe(process.env));
    expect(argv).toEqual([...powerShellArgv(STOP_SCRIPT)]);
    expect(options).toEqual({
      env: {
        ...process.env,
        NEXUS_RCLONE_STOP_PID: "5588",
        NEXUS_RCLONE_STOP_RESULT: RESULT
      },
      stdio: "ignore",
      timeout: expect.any(Number),
      windowsHide: true
    });
  });

  it("an rclone the script had to end through its handle is reported as killed", () => {
    powerShellLeaves("killed\r\n");
    expect(stopHidden(5588)).toBe("killed");
    expect(fs.existsSync(RESULT)).toBe(false);
  });

  it("PowerShell missing, or ended at its timeout, is null — nothing is known, the caller kills as before", () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("spawnSync powershell.exe ENOENT"), {
        code: "ENOENT",
        status: null
      });
    });
    expect(stopHidden(5588)).toBeNull();
    execFileSync.mockImplementation((_command, _args, options) => {
      // The event was raised, then PowerShell was killed at the timeout: the word is there, the status is not.
      fs.writeFileSync(options.env[STOP_ENV.result] ?? "", "exited\r\n");
      throw Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), {
        code: "ETIMEDOUT",
        signal: "SIGTERM",
        status: null
      });
    });
    expect(stopHidden(5588)).toBeNull();
    expect(fs.existsSync(RESULT)).toBe(false);
  });

  it("PowerShell exiting non-zero is null even when a word was written", () => {
    powerShellLeaves("exited\r\n", 1);
    expect(stopHidden(5588)).toBeNull();
    expect(fs.existsSync(RESULT)).toBe(false);
  });

  it("no answer, or a garbled one, is null", () => {
    execFileSync.mockImplementation(() => "");
    expect(stopHidden(5588)).toBeNull();
    powerShellLeaves("exited\r\nWARNING: a second line\r\n");
    expect(stopHidden(5588)).toBeNull();
    expect(fs.existsSync(RESULT)).toBe(false);
  });

  it("a stale answer from an earlier stop is removed before PowerShell runs, so it is never read as this one's", () => {
    fs.writeFileSync(RESULT, "exited\r\n");
    execFileSync.mockImplementation(() => "");
    expect(stopHidden(5588)).toBeNull();
  });

  it("a pid that is not a positive whole number never reaches a shell", () => {
    for (const pid of [0, -1, 1.5, Number.NaN]) {
      expect(() => stopHidden(pid)).toThrow(/not a pid/);
    }
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
