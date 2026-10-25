import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  managedRcloneFor,
  type RcloneBinary
} from "../../../workspace-direct-mount/managed-rclone";
import { powerShellExe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import {
  parseStartResult,
  START_ENV,
  START_SCRIPT,
  START_WINDOW_MS,
  startHidden
} from "./start-rclone-hidden";
import { powerShellArgv } from "./win32-powershell";

const execFileSync =
  vi.fn<(command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => string>();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) =>
    execFileSync(...(args as [string, string[], { env: NodeJS.ProcessEnv }]))
}));

const SANDBOX = path.join(process.env.TMPDIR ?? "/tmp", `nexus-start-hidden-${process.pid}`);
const LOG = path.join(SANDBOX, "logs", "general-context-0123456789abcdef.log");
const RESULT = `${LOG}.${String(process.pid)}.start`;
// The managed copy's Windows address, branded as the preflight would have: the probe itself has its own cases.
const RCLONE = managedRcloneFor("win32") as RcloneBinary;
const ENV = { SystemRoot: "C:\\Windows", RCLONE_CONFIG: "NUL" };
const ARGS = ["mount", "nxws:", "X:", "--volname", "General Context (Acme’s)"];

/** What PowerShell leaves when the script ran: the one-line result in the file the env names. */
function powerShellLeaves(resultText: string, status = 0): void {
  execFileSync.mockImplementation((_command, _args, options) => {
    const resultPath = options.env[START_ENV.result];
    if (resultPath === undefined) throw new Error("the start was given no result path");
    fs.writeFileSync(resultPath, resultText);
    if (status !== 0) throw Object.assign(new Error("Command failed"), { status });
    return "";
  });
}

beforeEach(() => {
  execFileSync.mockReset();
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

describe("START_SCRIPT — one constant line, every value from the environment", () => {
  it("reads the five variables, removes them before rclone starts, starts hidden with stderr to the log, waits the window, and writes pid or exit code", () => {
    expect(START_SCRIPT).toBe(
      "$s = @{ exe = $env:NEXUS_RCLONE_START_EXE; args = $env:NEXUS_RCLONE_START_ARGS; cwd = $env:NEXUS_RCLONE_START_CWD; " +
        "log = $env:NEXUS_RCLONE_START_LOG; result = $env:NEXUS_RCLONE_START_RESULT }; " +
        "Remove-Item Env:NEXUS_RCLONE_START_EXE, Env:NEXUS_RCLONE_START_ARGS, Env:NEXUS_RCLONE_START_CWD, Env:NEXUS_RCLONE_START_LOG, Env:NEXUS_RCLONE_START_RESULT; " +
        "try { $p = Start-Process -FilePath $s.exe -ArgumentList $s.args -WorkingDirectory $s.cwd" +
        " -WindowStyle Hidden -RedirectStandardError $s.log -PassThru -ErrorAction Stop; $null = $p.Handle } " +
        "catch { Set-Content -LiteralPath $s.result -Value ('failed ' + $_.Exception.Message) -Encoding ascii; exit 0 }; " +
        "Set-Content -LiteralPath $s.result -Value ('pid ' + $p.Id) -Encoding ascii; " +
        "if ($p.WaitForExit(2000)) { Set-Content -LiteralPath $s.result -Value ('exited ' + $p.ExitCode) -Encoding ascii }"
    );
    // The pid is on disk before the wait: a PowerShell killed during it still leaves the pid to end.
    expect(START_SCRIPT.indexOf("('pid ' + $p.Id)")).toBeLessThan(
      START_SCRIPT.indexOf("WaitForExit")
    );
    expect(START_WINDOW_MS).toBe(2000);
    // No quoting of any mount value can appear in the line: a typographic apostrophe in a volume name must not matter.
    expect(START_SCRIPT).not.toContain("'C:");
    expect(START_SCRIPT).not.toContain("RedirectStandardOutput");
  });
});

describe("parseStartResult — pid or exit code, nothing else", () => {
  it.each([
    ["pid 5588\r\n", { pid: 5588 }],
    ["exited 2\r\n", { exited: 2 }],
    ["exited -1073741510\r\n", { exited: -1073741510 }],
    ["failed Access is denied\r\n", { failed: "Access is denied" }],
    ["failed \r\n", null],
    ["pid 0\r\n", null],
    ["5588\r\n", null],
    ["pid 5588\r\nWARNING: something else\r\n", null],
    ["Start-Process : This command cannot be run\r\n", null],
    ["", null]
  ])("%j → %j", (text, parsed) => {
    expect(parseStartResult(text)).toEqual(parsed);
  });
});

describe("startHidden — PowerShell starts rclone, the answer comes back through the file", () => {
  it("hands PowerShell rclone's env plus the five values, no pipes; reads the pid; removes the result file", () => {
    powerShellLeaves("pid 5588\r\n");

    expect(startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toEqual({
      pid: 5588,
      startFailure: null
    });
    expect(fs.existsSync(RESULT)).toBe(false);
    const [command, argv, options] = execFileSync.mock.calls[0] ?? [];
    expect(command).toBe(powerShellExe(process.env));
    expect(argv).toEqual([...powerShellArgv(START_SCRIPT)]);
    expect(options).toEqual({
      env: {
        ...ENV,
        NEXUS_RCLONE_START_EXE: RCLONE,
        NEXUS_RCLONE_START_ARGS: 'mount nxws: X: --volname "General Context (Acme’s)"',
        NEXUS_RCLONE_START_CWD: "C:\\logs",
        NEXUS_RCLONE_START_LOG: LOG,
        NEXUS_RCLONE_START_RESULT: RESULT
      },
      stdio: "ignore",
      timeout: expect.any(Number),
      windowsHide: true
    });
  });

  it("an rclone that ended inside the window is the fail-fast sentence with its code, for the caller to read the log", () => {
    powerShellLeaves("exited 2\r\n");
    expect(startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toEqual({
      pid: undefined,
      startFailure: "rclone exited immediately (code 2)"
    });
    expect(fs.existsSync(RESULT)).toBe(false);
    powerShellLeaves("failed Access is denied\r\n");
    expect(startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toEqual({
      pid: undefined,
      startFailure: "Windows did not start rclone: Access is denied"
    });
  });

  it("PowerShell missing or killed at the timeout is a local-failed refusal — and an rclone it did start is ended first", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSync.mockImplementation((_command, _args, options) => {
      // Start-Process ran, then PowerShell was killed at the timeout: the result is there, the status is not.
      fs.writeFileSync(options.env[START_ENV.result] ?? "", "pid 5588\r\n");
      throw Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), {
        code: "ETIMEDOUT",
        signal: "SIGTERM",
        status: null
      });
    });
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining(
          "at its timeout, starting rclone; the rclone it started was ended."
        ),
        hint: expect.stringContaining("console window")
      })
    );
    expect(kill).toHaveBeenCalledWith(5588);
    expect(fs.existsSync(RESULT)).toBe(false);
    // Killed before Start-Process returned: nothing to end, and the message does not claim an end.
    kill.mockClear();
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT", status: null });
    });
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(/no rclone pid was read/);
    expect(kill).not.toHaveBeenCalled();
  });

  it("PowerShell exiting non-zero is a refusal even when a pid was written — the pid is ended, never recorded", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    powerShellLeaves("pid 5588\r\n", 1);
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining(
          "exited 1 starting rclone; the rclone it started was ended."
        )
      })
    );
    expect(kill).toHaveBeenCalledWith(5588);
  });

  it("no result, or a garbled one, is a refusal with nothing to end — never a row with a guessed pid", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    execFileSync.mockImplementation(() => "");
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({ code: "CLI_LOCAL_FAILED" })
    );
    powerShellLeaves("pid 5588\r\nWARNING: a second line\r\n");
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({ code: "CLI_LOCAL_FAILED" })
    );
    expect(kill).not.toHaveBeenCalled();
    expect(fs.existsSync(RESULT)).toBe(false);
  });

  it("a stale result file from an earlier start is removed before PowerShell runs, so it can never be read as this start's", () => {
    fs.writeFileSync(RESULT, "pid 4242\r\n");
    execFileSync.mockImplementation(() => "");
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({ code: "CLI_LOCAL_FAILED" })
    );
  });

  it("an rclone already gone when the refusal ends it is no further error", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    powerShellLeaves("pid 5588\r\n", 1);
    expect(() => startHidden(RCLONE, ARGS, ENV, "C:\\logs", LOG)).toThrow(
      expect.objectContaining({ code: "CLI_LOCAL_FAILED" })
    );
  });
});
