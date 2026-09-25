import { beforeEach, describe, expect, it, vi } from "vitest";

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
