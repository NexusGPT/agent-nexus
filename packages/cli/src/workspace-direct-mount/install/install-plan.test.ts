import { describe, expect, it, vi } from "vitest";

import type { PreflightProblems } from "../rclone-preflight-problem";
import { type InstallHost, installPlanFor } from "./install-plan";

const hostWith = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  brew: boolean,
  terminal = true
): InstallHost & { readonly brewAsked: () => number } => {
  const hasBrew = vi.fn(() => brew);
  return { platform, arch, hasBrew, terminal, brewAsked: () => hasBrew.mock.calls.length };
};

const NONE: PreflightProblems = { rclone: null, fuse: null };
const RCLONE_MISSING: PreflightProblems = { rclone: { kind: "rclone-missing" }, fuse: null };
const NO_FUSE: PreflightProblems = { rclone: null, fuse: { kind: "no-fuse-library" } };

describe("installPlanFor — the preflight's two answers, planned at once", () => {
  it("nothing missing → nothing to do", () => {
    expect(installPlanFor(NONE, hostWith("darwin", "arm64", true))).toEqual({ kind: "nothing" });
  });

  it("a missing or unmountable rclone → one zip step for this machine's build, and brew is never asked", () => {
    const mac = hostWith("darwin", "arm64", true);
    expect(installPlanFor(RCLONE_MISSING, mac)).toEqual({
      kind: "steps",
      steps: [{ kind: "rclone-zip", target: "osx-arm64" }]
    });
    expect(
      installPlanFor(
        { rclone: { kind: "no-mount-support", verdict: "no-mount-support" }, fuse: null },
        hostWith("linux", "x64", false)
      )
    ).toEqual({ kind: "steps", steps: [{ kind: "rclone-zip", target: "linux-amd64" }] });
    expect(mac.brewAsked()).toBe(0);
  });

  it("no plug on macOS → the cask when brew exists, the pkg when it does not", () => {
    const withBrew = hostWith("darwin", "arm64", true);
    expect(installPlanFor(NO_FUSE, withBrew)).toEqual({
      kind: "steps",
      steps: [{ kind: "fuse-t-cask" }]
    });
    expect(withBrew.brewAsked()).toBe(1);
    expect(installPlanFor(NO_FUSE, hostWith("darwin", "x64", false))).toEqual({
      kind: "steps",
      steps: [{ kind: "fuse-t-pkg", password: "terminal" }]
    });
  });

  it("no terminal (an agent runs the CLI) → the pkg behind the macOS password window, brew never asked even when present", () => {
    const agent = hostWith("darwin", "arm64", true, false);
    expect(installPlanFor(NO_FUSE, agent)).toEqual({
      kind: "steps",
      steps: [{ kind: "fuse-t-pkg", password: "dialog" }]
    });
    expect(agent.brewAsked()).toBe(0);
  });

  it("worker and plug both missing → two steps, rclone first, one plan", () => {
    expect(
      installPlanFor(
        { rclone: { kind: "rclone-missing" }, fuse: { kind: "no-fuse-library" } },
        hostWith("darwin", "arm64", true)
      )
    ).toEqual({
      kind: "steps",
      steps: [{ kind: "rclone-zip", target: "osx-arm64" }, { kind: "fuse-t-cask" }]
    });
  });

  it("one unfixable problem makes the WHOLE plan manual, whatever else is fixable", () => {
    expect(
      installPlanFor(
        { rclone: { kind: "rclone-missing" }, fuse: { kind: "macfuse-not-approved" } },
        hostWith("darwin", "arm64", true)
      )
    ).toEqual({ kind: "manual", because: "macfuse-not-approved" });
  });

  it("no build to offer → manual: any arch the pins do not cover", () => {
    expect(installPlanFor(RCLONE_MISSING, hostWith("win32", "ia32", false))).toEqual({
      kind: "manual",
      because: "no-build-for-platform"
    });
    expect(installPlanFor(RCLONE_MISSING, hostWith("darwin", "ia32", false))).toEqual({
      kind: "manual",
      because: "no-build-for-platform"
    });
  });

  it("Windows: rclone missing → the windows-amd64 zip, no administrator; arm64 → its own build", () => {
    expect(installPlanFor(RCLONE_MISSING, hostWith("win32", "x64", false))).toEqual({
      kind: "steps",
      steps: [{ kind: "rclone-zip", target: "windows-amd64" }]
    });
    expect(installPlanFor(RCLONE_MISSING, hostWith("win32", "arm64", false))).toEqual({
      kind: "steps",
      steps: [{ kind: "rclone-zip", target: "windows-arm64" }]
    });
  });

  it("WinFsp missing → the one MSI step, terminal or not (Windows has no sudo); off Windows a broken invariant", () => {
    const noWinFsp: PreflightProblems = { rclone: null, fuse: { kind: "no-winfsp" } };
    for (const terminal of [true, false]) {
      expect(installPlanFor(noWinFsp, { ...hostWith("win32", "x64", false), terminal })).toEqual({
        kind: "steps",
        steps: [{ kind: "winfsp-msi" }]
      });
    }
    expect(() => installPlanFor(noWinFsp, hostWith("darwin", "arm64", true))).toThrow(
      "no-winfsp planned on darwin"
    );
  });

  it("Windows, both missing → two steps behind one question, rclone first, one UAC prompt", () => {
    const both: PreflightProblems = {
      rclone: { kind: "rclone-missing" },
      fuse: { kind: "no-winfsp" }
    };
    expect(installPlanFor(both, hostWith("win32", "x64", false))).toEqual({
      kind: "steps",
      steps: [{ kind: "rclone-zip", target: "windows-amd64" }, { kind: "winfsp-msi" }]
    });
  });

  it("no FUSE device (WSL1, a container) → manual: nothing this CLI installs adds a device", () => {
    const noDevice: PreflightProblems = { rclone: null, fuse: { kind: "no-fuse-device" } };
    expect(installPlanFor(noDevice, hostWith("linux", "x64", false))).toEqual({
      kind: "manual",
      because: "no-fuse-device"
    });
  });

  it("an rclone the OS refused → manual on every platform: no step reinstalls a file that is there", () => {
    const blocked: PreflightProblems = {
      rclone: {
        kind: "rclone-blocked",
        path: "C:\\Users\\jo\\.nexus-mcp\\bin\\rclone.exe",
        code: "EACCES"
      },
      fuse: null
    };
    expect(installPlanFor(blocked, hostWith("win32", "x64", false))).toEqual({
      kind: "manual",
      because: "rclone-blocked"
    });
    expect(installPlanFor(blocked, hostWith("darwin", "arm64", true))).toEqual({
      kind: "manual",
      because: "rclone-blocked"
    });
  });

  it("a FUSE problem off macOS is a broken invariant, not a case: the probe never emits one there", () => {
    expect(() => installPlanFor(NO_FUSE, hostWith("linux", "x64", false))).toThrow(
      /no-fuse-library planned on linux/
    );
  });
});
