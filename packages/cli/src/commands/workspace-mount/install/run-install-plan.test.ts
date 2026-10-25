import fs from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it.
const SANDBOX = vi.hoisted(() => {
  // Joined by the host's own `path` (no import exists this early): one separator on Windows too.
  const dir = process
    .getBuiltinModule("node:path")
    .join(process.env.TMPDIR ?? "/tmp", `nexus-run-install-plan-${process.pid}`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

// The three installers are faked: this spec pins the ORDER, the pin values
// each one receives, and the lock around them — not the installs themselves.
// The lock's path is spelled from the sandbox here because a mock factory is
// hoisted above the imports; a case below proves it equals the real constant.
const hoisted = vi.hoisted(() => ({
  calls: [] as { readonly step: string; readonly lockHeld: boolean; readonly arg: unknown }[],
  lockDir: process
    .getBuiltinModule("node:path")
    .join(process.env.HOME ?? "", ".nexus-mcp", "bin", ".install-lock")
}));
const { calls } = hoisted;
vi.mock("./install-rclone-zip", () => ({
  installRcloneZip: vi.fn(async (_io: unknown, spec: unknown) => {
    calls.push({ step: "rclone-zip", lockHeld: fs.existsSync(hoisted.lockDir), arg: spec });
  })
}));
vi.mock("./win32/install-winfsp-msi", () => ({
  installWinFspMsi: vi.fn(async (_io: unknown, spec: unknown) => {
    calls.push({ step: "winfsp-msi", lockHeld: fs.existsSync(hoisted.lockDir), arg: spec });
  })
}));
vi.mock("./darwin/install-fuse-t", () => ({
  installFuseTCask: vi.fn((_io: unknown, cask: unknown) => {
    calls.push({ step: "fuse-t-cask", lockHeld: fs.existsSync(hoisted.lockDir), arg: cask });
  }),
  installFuseTPkg: vi.fn(async (_io: unknown, spec: unknown) => {
    calls.push({ step: "fuse-t-pkg", lockHeld: fs.existsSync(hoisted.lockDir), arg: spec });
    throw new Error("installer declined");
  })
}));

import { FUSE_T_LIBRARY } from "../../../workspace-direct-mount/darwin/fuse-libraries";
import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import {
  FUSE_T_PIN,
  fuseTPkgUrl,
  RCLONE_PIN,
  rcloneZipUrl
} from "../../../workspace-direct-mount/install/install-pins";
import { WINFSP_PIN, winFspMsiUrl } from "../../../workspace-direct-mount/install/win32/winfsp-pin";
import { managedRcloneFor } from "../../../workspace-direct-mount/managed-rclone";
import { INSTALL_LOCK_DIR } from "./install-lock";
import { runInstallPlan } from "./run-install-plan";

const io: DepsIo = {
  platform: "darwin",
  arch: "arm64",
  env: {},
  stdinIsTTY: true,
  exists: () => false,
  rcloneVersion: () => null,
  macFuseApproved: () => "unknown",
  winFspInstallDir: () => "unknown",
  hasBrew: () => true,
  download: vi.fn(),
  run: vi.fn(),
  askYesNo: vi.fn(),
  promptLine: vi.fn()
};

describe("runInstallPlan — the steps, in order, under the lock, with the pins' values", () => {
  beforeEach(() => {
    calls.length = 0;
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  });
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("runs rclone then the cask, each while the lock is held, each with the pin it was rendered from", async () => {
    expect(hoisted.lockDir).toBe(INSTALL_LOCK_DIR);
    await runInstallPlan(io, [
      { kind: "rclone-zip", target: "osx-arm64" },
      { kind: "fuse-t-cask" }
    ]);
    expect(calls.map((c) => c.step)).toEqual(["rclone-zip", "fuse-t-cask"]);
    expect(calls.every((c) => c.lockHeld)).toBe(true);
    expect(calls[0]?.arg).toEqual({
      url: rcloneZipUrl("osx-arm64"),
      sha256: RCLONE_PIN.sha256["osx-arm64"],
      member: "rclone-v1.74.4-osx-arm64/rclone"
    });
    expect(calls[1]?.arg).toBe(FUSE_T_PIN.cask);
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
  });

  it("Windows: rclone.exe then the WinFsp MSI, under the lock, each with the pin it was rendered from", async () => {
    await runInstallPlan(io, [
      { kind: "rclone-zip", target: "windows-amd64" },
      { kind: "winfsp-msi" }
    ]);
    expect(calls.map((c) => c.step)).toEqual(["rclone-zip", "winfsp-msi"]);
    expect(calls.every((c) => c.lockHeld)).toBe(true);
    expect(calls[0]?.arg).toEqual({
      url: rcloneZipUrl("windows-amd64"),
      sha256: RCLONE_PIN.sha256["windows-amd64"],
      member: "rclone-v1.74.4-windows-amd64/rclone.exe"
    });
    expect(calls[1]?.arg).toEqual({
      url: winFspMsiUrl(),
      sha256: WINFSP_PIN.sha256,
      name: "winfsp-2.1.25156.msi"
    });
  });

  it("Windows: a managed rclone.exe that another mount installed while this one waited for the lock is not downloaded or renamed over", async () => {
    // The other mount's copy is in place and answers with the cmount tag: the
    // same probe the preflight runs now passes the rclone slot. WinFsp is still
    // absent, so its step still runs.
    const managed = managedRcloneFor("win32");
    const racing: DepsIo = {
      ...io,
      platform: "win32",
      arch: "x64",
      exists: (file) => file === managed,
      rcloneVersion: (binary) =>
        binary === managed ? "rclone v1.74.4\n- go/tags: cmount\n" : null,
      winFspInstallDir: () => null
    };
    await runInstallPlan(racing, [
      { kind: "rclone-zip", target: "windows-amd64" },
      { kind: "winfsp-msi" }
    ]);
    expect(calls.map((c) => c.step)).toEqual(["winfsp-msi"]);
    expect(calls.every((c) => c.lockHeld)).toBe(true);
  });

  it("Windows: a WinFsp registry read that cannot run under the lock proves nothing installed, so the MSI still runs", async () => {
    // The preflight passes an unreadable WinFsp key (rclone is the better
    // judge), but only a key and this CPU's DLL prove the MSI's work is done.
    const unreadable: DepsIo = {
      ...io,
      platform: "win32",
      arch: "x64",
      winFspInstallDir: () => "unknown"
    };
    await runInstallPlan(unreadable, [{ kind: "winfsp-msi" }]);
    expect(calls.map((c) => c.step)).toEqual(["winfsp-msi"]);
  });

  it("macOS: a FUSE-T another mount installed while this one waited is not installed twice (no second sudo prompt)", async () => {
    const racing: DepsIo = { ...io, exists: (file) => file === FUSE_T_LIBRARY };
    await runInstallPlan(racing, [
      { kind: "rclone-zip", target: "osx-arm64" },
      { kind: "fuse-t-pkg", password: "terminal" }
    ]);
    expect(calls.map((c) => c.step)).toEqual(["rclone-zip"]);
  });

  it("a failing step stops the plan there, and the lock is released", async () => {
    await expect(
      runInstallPlan(io, [
        { kind: "fuse-t-pkg", password: "dialog" },
        { kind: "rclone-zip", target: "linux-amd64" }
      ])
    ).rejects.toThrow("installer declined");
    expect(calls.map((c) => c.step)).toEqual(["fuse-t-pkg"]);
    expect(calls[0]?.arg).toEqual({
      url: fuseTPkgUrl(),
      sha256: FUSE_T_PIN.sha256,
      name: "fuse-t-macos-installer-1.2.7.pkg",
      password: "dialog"
    });
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
  });
});
