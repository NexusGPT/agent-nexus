import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { hostPlatform, stagePlatform } from "../../stage-platform";
import { promptStream } from "../../util/confirm";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";

// Only execFileSync is faked: the seam must not reach for spawnSync, because
// the driven mount specs' fakes expose only execFileSync / execSync / spawn.
const execFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...args),
  execSync: vi.fn(),
  spawn: vi.fn()
}));

const { realDepsIo } = await import("./real-deps-io");

const pretendPlatform = stagePlatform();

const withCode = (code: string): Error => Object.assign(new Error(code), { code });
const withStatus = (status: number): Error =>
  Object.assign(new Error(`exit ${status}`), { status });

describe("realDepsIo — the real bag, and how it tells failures apart", () => {
  beforeEach(() => execFileSync.mockReset());

  it("run: a program that is not there is 'not-found', a program that ran and failed is 'exit N'", () => {
    const io = realDepsIo();
    execFileSync.mockImplementationOnce(() => {
      throw withCode("ENOENT");
    });
    expect(io.run("unzip", ["-v"], {})).toEqual({ ok: false, reason: "not-found" });
    execFileSync.mockImplementationOnce(() => {
      throw withStatus(3);
    });
    expect(io.run("brew", ["install", "x"], {})).toEqual({ ok: false, reason: "exit", status: 3 });
    execFileSync.mockImplementationOnce(() => "");
    expect(io.run("sudo", ["-V"], {})).toEqual({ ok: true });
  });

  it("run: stdin is the terminal, the child's stdout is the PROMPT stream, and the caller's env is the child's env", () => {
    const env = { PATH: "/usr/bin", HOME: "/Users/me" };
    execFileSync.mockImplementationOnce(() => "");
    realDepsIo().run("brew", ["--version"], env);
    // Never fd 1 by default: a `--json` document owns stdout, and brew's
    // progress must not land inside it.
    const promptFd = promptStream() === process.stdout ? 1 : 2;
    expect(execFileSync).toHaveBeenCalledWith("brew", ["--version"], {
      stdio: [0, promptFd, 2],
      env
    });
    expect(promptFd).toBe(2);
  });

  it("rcloneVersion: the binary's text, or null when it could not run", () => {
    const binary = "rclone" as RcloneBinary;
    execFileSync.mockImplementationOnce(() => "rclone v1.74.4\n- go/tags: cmount\n");
    expect(realDepsIo().rcloneVersion(binary)).toContain("cmount");
    execFileSync.mockImplementationOnce(() => {
      throw withCode("ENOENT");
    });
    expect(realDepsIo().rcloneVersion(binary)).toBeNull();
  });

  it("rcloneVersion: on Windows the probe runs from the home folder, never the folder the command was typed in", () => {
    // Windows looks for a bare `rclone` in the working folder before PATH.
    const cwdOf = (platform: NodeJS.Platform): unknown => {
      pretendPlatform(platform);
      execFileSync.mockImplementationOnce(() => "rclone v1.74.4\n");
      realDepsIo().rcloneVersion("rclone" as RcloneBinary);
      return (execFileSync.mock.lastCall?.[2] as { cwd?: string }).cwd;
    };
    expect(cwdOf("win32")).toBe(os.homedir());
    expect(cwdOf("darwin")).toBeUndefined();
    expect(cwdOf("linux")).toBeUndefined();
  });

  it("rcloneVersion: a bare PATH name is never read for its exec bit — stat would read the working folder's file instead", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-cwd-rclone-"));
    fs.writeFileSync(path.join(dir, "rclone"), "", { mode: 0o755 });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      pretendPlatform("linux");
      execFileSync.mockImplementationOnce(() => {
        throw withCode("EACCES");
      });
      // An executable ./rclone sits here; PATH's rclone is a different file.
      expect(realDepsIo().rcloneVersion("rclone" as RcloneBinary)).toBeNull();
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rcloneVersion: an errno other than ENOENT is a refusal on Windows only; macOS and Linux read it as missing, so it is reinstalled", () => {
    const binary = "rclone" as RcloneBinary;
    const refusedWith = (platform: NodeJS.Platform, code: string) => {
      pretendPlatform(platform);
      execFileSync.mockImplementationOnce(() => {
        throw withCode(code);
      });
      return realDepsIo().rcloneVersion(binary);
    };
    // No exec bit, or the wrong CPU: a damaged managed copy the offer heals.
    expect(refusedWith("darwin", "EACCES")).toBeNull();
    expect(refusedWith("linux", "ENOEXEC")).toBeNull();
    // Smart App Control, AppLocker or antivirus: an allow rule, never a reinstall.
    expect(refusedWith("win32", "EACCES")).toEqual({ refused: "EACCES" });
    expect(refusedWith("win32", "UNKNOWN")).toEqual({ refused: "UNKNOWN" });
    expect(refusedWith("win32", "ENOENT")).toBeNull();
  });

  // POSIX hosts only: the verdict reads the file's exec bit, and NTFS has none.
  it.skipIf(hostPlatform() === "win32")(
    "rcloneVersion: an errno that a reinstall cannot fix is a refusal on every platform; one it can fix is missing",
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-exec-bit-"));
      const file = path.join(dir, "rclone");
      fs.writeFileSync(file, "", { mode: 0o755 });
      const refusedWith = (platform: NodeJS.Platform, code: string) => {
        pretendPlatform(platform);
        execFileSync.mockImplementationOnce(() => {
          throw withCode(code);
        });
        return realDepsIo().rcloneVersion(file as RcloneBinary);
      };
      try {
        // The exec bit is set and the OS still says no: a noexec mount or SELinux.
        expect(refusedWith("linux", "EACCES")).toEqual({ refused: "EACCES" });
        expect(refusedWith("darwin", "EPERM")).toEqual({ refused: "EPERM" });
        // A wrong-CPU or truncated rclone.exe: the pinned build replaces it.
        expect(refusedWith("win32", "EFTYPE")).toBeNull();
        fs.chmodSync(file, 0o644);
        expect(refusedWith("linux", "EACCES")).toBeNull();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it("hasBrew: true only when `brew --prefix` runs and exits 0", () => {
    execFileSync.mockImplementationOnce(() => "/opt/homebrew\n");
    expect(realDepsIo().hasBrew()).toBe(true);
    execFileSync.mockImplementationOnce(() => {
      throw withCode("ENOENT");
    });
    expect(realDepsIo().hasBrew()).toBe(false);
    expect(execFileSync).toHaveBeenCalledWith("brew", ["--prefix"], expect.anything());
  });

  it("stdinIsTTY is decided on stdin, and is false here where no terminal is attached", () => {
    expect(realDepsIo().stdinIsTTY).toBe(process.stdin.isTTY === true);
  });
});
