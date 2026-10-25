import { beforeEach, describe, expect, it, vi } from "vitest";

import { powerShellExe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import {
  POWERSHELL_TIMEOUT_MS,
  powerShellArgv,
  readPowerShell,
  runPowerShell
} from "./win32-powershell";

const execFileSync =
  vi.fn<(command: string, args: string[], options: Record<string, unknown>) => string>();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) =>
    execFileSync(...(args as [string, string[], Record<string, unknown>]))
}));

beforeEach(() => {
  execFileSync.mockReset();
});

describe("powerShellArgv — one shape for every Windows reader", () => {
  it("runs the script with no profile, no prompt, and UTF-8 on stdout, byte for byte", () => {
    expect(powerShellArgv("Get-Date")).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Date"
    ]);
  });
});

describe("readPowerShell — what was printed, or null", () => {
  it("hands back what a script printed, through PowerShell's System32 address with that argv, in a hidden console", () => {
    execFileSync.mockReturnValue("C:\\Program Files (x86)\\WinFsp\r\n");
    expect(readPowerShell("x")).toBe("C:\\Program Files (x86)\\WinFsp\r\n");
    expect(execFileSync).toHaveBeenCalledWith(
      powerShellExe(process.env),
      [...powerShellArgv("x")],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: POWERSHELL_TIMEOUT_MS,
        windowsHide: true
      }
    );
    // Never the bare name: Windows looks in the current folder before PATH.
    expect(execFileSync.mock.calls[0]?.[0]).toMatch(
      /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/
    );
  });

  it("bounds every call with a timeout, and reads a call it killed as not run — a stalled WMI must not hang status", () => {
    execFileSync.mockImplementation((_command, _args, options) => {
      expect(options.timeout).toBe(POWERSHELL_TIMEOUT_MS);
      throw Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), {
        code: "ETIMEDOUT",
        signal: "SIGTERM",
        status: null
      });
    });
    expect(POWERSHELL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(readPowerShell("x")).toBeNull();
  });

  it("reports a script that exited non-zero, or PowerShell missing, as null — a different answer from an empty print", () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("Command failed"), { status: 1 });
    });
    expect(readPowerShell("x")).toBeNull();
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("spawnSync powershell.exe ENOENT"), { code: "ENOENT" });
    });
    expect(readPowerShell("x")).toBeNull();
    execFileSync.mockReturnValue("");
    expect(readPowerShell("x")).toBe("");
  });
});

describe("runPowerShell — a script run for its effects, with no pipes", () => {
  const ENV = { SystemRoot: "C:\\Windows", AWS_CONFIG_FILE: "C:\\aws.config" };

  it("runs the same address and argv as the reader, under the given env, every stdio ignored", () => {
    execFileSync.mockReturnValue("");
    expect(runPowerShell("Start-Process x", ENV)).toEqual({ ran: true, status: 0 });
    expect(execFileSync).toHaveBeenCalledWith(
      powerShellExe(process.env),
      [...powerShellArgv("Start-Process x")],
      { env: ENV, stdio: "ignore", timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true }
    );
  });

  it("hands back a non-zero exit as ran with its status", () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("Command failed"), { status: 1 });
    });
    expect(runPowerShell("x", ENV)).toEqual({ ran: true, status: 1 });
  });

  it("reads PowerShell missing, or killed at the timeout, as not run", () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("spawnSync powershell.exe ENOENT"), { code: "ENOENT" });
    });
    expect(runPowerShell("x", ENV)).toEqual({ ran: false });
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), {
        code: "ETIMEDOUT",
        signal: "SIGTERM",
        status: null
      });
    });
    expect(runPowerShell("x", ENV)).toEqual({ ran: false });
  });
});
