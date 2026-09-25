import fs from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it.
const SANDBOX = vi.hoisted(() => {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-run-install-plan-${process.pid}`;
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
  lockDir: `${process.env.HOME}/.nexus-mcp/bin/.install-lock`
}));
const { calls } = hoisted;
vi.mock("./install-rclone-zip", () => ({
  installRcloneZip: vi.fn(async (_io: unknown, spec: unknown) => {
    calls.push({ step: "rclone-zip", lockHeld: fs.existsSync(hoisted.lockDir), arg: spec });
  })
}));
vi.mock("./install-fuse-t", () => ({
  installFuseTCask: vi.fn((_io: unknown, cask: unknown) => {
    calls.push({ step: "fuse-t-cask", lockHeld: fs.existsSync(hoisted.lockDir), arg: cask });
  }),
  installFuseTPkg: vi.fn(async (_io: unknown, spec: unknown) => {
    calls.push({ step: "fuse-t-pkg", lockHeld: fs.existsSync(hoisted.lockDir), arg: spec });
    throw new Error("installer declined");
  })
}));

import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import {
  FUSE_T_PIN,
  fuseTPkgUrl,
  RCLONE_PIN,
  rcloneZipUrl
} from "../../../workspace-direct-mount/install/install-pins";
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
