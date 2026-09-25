import { describe, expect, it, vi } from "vitest";

// The install itself is faked: this spec pins the conversation and the exits.
// The fake "installs" by making the managed copy exist for the re-probe.
const runInstallPlan = vi.hoisted(() => vi.fn());
vi.mock("./install/run-install-plan", () => ({ runInstallPlan }));

import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { FUSE_T_LIBRARY, MACFUSE_LIBRARY } from "../../workspace-direct-mount/fuse-libraries";
import { MANAGED_RCLONE, PATH_RCLONE } from "../../workspace-direct-mount/managed-rclone";
import { ensureRcloneCanMount } from "./ensure-rclone-can-mount";

const OFFICIAL = "rclone v1.74.4\n- go/tags: cmount\n";

interface Machine {
  readonly present?: string[];
  readonly rcloneRuns?: boolean;
  readonly approved?: boolean | "unknown";
  readonly tty?: boolean;
  readonly answer?: boolean;
}

/** A Mac with rclone on PATH and macFUSE approved unless the case says otherwise. */
const machine = (m: Machine = {}) => {
  const present = new Set(m.present ?? [MACFUSE_LIBRARY]);
  const printed: string[] = [];
  const asked: string[] = [];
  const io: DepsIo = {
    platform: "darwin",
    arch: "arm64",
    env: {},
    stdinIsTTY: m.tty ?? true,
    exists: (file) => present.has(file),
    rcloneVersion: (binary) =>
      binary === MANAGED_RCLONE || (m.rcloneRuns ?? true) ? OFFICIAL : null,
    macFuseApproved: () => m.approved ?? true,
    hasBrew: () => true,
    download: vi.fn(),
    run: vi.fn(),
    askYesNo: async (question) => {
      asked.push(question);
      return m.answer ?? false;
    },
    promptLine: (text) => {
      printed.push(text);
    }
  };
  runInstallPlan.mockReset();
  runInstallPlan.mockImplementation(async (_io: unknown, steps: { kind: string }[]) => {
    if (steps.some((s) => s.kind === "rclone-zip")) present.add(MANAGED_RCLONE);
    if (steps.some((s) => s.kind.startsWith("fuse-t"))) present.add(FUSE_T_LIBRARY);
  });
  return { io, printed, asked, present };
};

describe("ensureRcloneCanMount — the offer, and every exit that is not a mount", () => {
  it("nothing missing → the probed binary, no words, no install", async () => {
    const m = machine();
    await expect(ensureRcloneCanMount("direct", "ask", m.io)).resolves.toBe(PATH_RCLONE);
    expect(m.printed).toEqual([]);
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("unfixable (macFUSE unapproved) → today's refusal, whatever the policy, nothing printed", async () => {
    for (const policy of ["ask", "install", "never"] as const) {
      const m = machine({ approved: false });
      await expect(ensureRcloneCanMount("direct", policy, m.io)).rejects.toMatchObject({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining("load_macfuse"),
        hint: expect.stringContaining("https://rclone.org/downloads/")
      });
      expect(m.printed).toEqual([]);
    }
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("--no-install-deps → today's refusal byte for byte: the message, the hint, no offer printed, brew never probed", async () => {
    const m = machine({ rcloneRuns: false, present: [] });
    const hasBrew = vi.spyOn(m.io, "hasBrew");
    await expect(ensureRcloneCanMount("direct", "never", m.io)).rejects.toMatchObject({
      message: "--engine direct needs rclone, and none was found on PATH.",
      hint: expect.not.stringContaining("brew install")
    });
    expect(m.printed).toEqual([]);
    expect(hasBrew).not.toHaveBeenCalled();
  });

  it("no terminal, no flag → prints the exact commands, then refuses pointing at --install-deps", async () => {
    const m = machine({ rcloneRuns: false, tty: false });
    await expect(ensureRcloneCanMount("direct", "ask", m.io)).rejects.toMatchObject({
      hint: expect.stringContaining("--install-deps")
    });
    expect(m.printed.join("\n")).toContain(
      "download https://downloads.rclone.org/v1.74.4/rclone-v1.74.4-osx-arm64.zip"
    );
    expect(m.asked).toEqual([]);
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("terminal, answer n → 'Aborted', nothing installed", async () => {
    const m = machine({ rcloneRuns: false, answer: false });
    await expect(ensureRcloneCanMount("direct", "ask", m.io)).rejects.toMatchObject({
      message: expect.stringMatching(/^Aborted\./)
    });
    expect(m.asked).toEqual(["Install it now?"]);
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("terminal, answer y → installs, re-probes, and returns the MANAGED binary the spawn must use", async () => {
    const m = machine({ rcloneRuns: false, answer: true });
    await expect(ensureRcloneCanMount("direct", "ask", m.io)).resolves.toBe(MANAGED_RCLONE);
    expect(runInstallPlan).toHaveBeenCalledWith(m.io, [
      { kind: "rclone-zip", target: "osx-arm64" }
    ]);
  });

  it("--install-deps → no question; both missing → one plan of two steps, rclone first", async () => {
    const m = machine({ rcloneRuns: false, present: [] });
    await expect(ensureRcloneCanMount("direct", "install", m.io)).resolves.toBe(MANAGED_RCLONE);
    expect(m.asked).toEqual([]);
    expect(runInstallPlan).toHaveBeenCalledWith(m.io, [
      { kind: "rclone-zip", target: "osx-arm64" },
      { kind: "fuse-t-cask" }
    ]);
    expect(m.printed.join("\n")).toContain("brew install macos-fuse-t/homebrew-cask/fuse-t");
  });

  it("installed, but the re-probe still fails → a refusal that says so, never a mount", async () => {
    const m = machine({ rcloneRuns: false, present: [] });
    runInstallPlan.mockImplementation(async () => {
      m.present.add(MANAGED_RCLONE); // the plug never appeared
    });
    await expect(ensureRcloneCanMount("direct", "install", m.io)).rejects.toMatchObject({
      message: expect.stringContaining("Installed, but the preflight still fails")
    });
  });

  it("no terminal (an agent) + --install-deps → FUSE-T through the macOS password window, brew never asked", async () => {
    const m = machine({ present: [], tty: false });
    const hasBrew = vi.fn(() => true);
    await ensureRcloneCanMount("direct", "install", { ...m.io, hasBrew });
    expect(runInstallPlan).toHaveBeenCalledWith(expect.anything(), [
      { kind: "fuse-t-pkg", password: "dialog" }
    ]);
    expect(hasBrew).not.toHaveBeenCalled();
  });

  it("--install-deps where no pinned rclone exists (Windows) says the flag had nothing to install", async () => {
    const m = machine({ rcloneRuns: false });
    const windows: DepsIo = { ...m.io, platform: "win32", arch: "x64" };
    await expect(ensureRcloneCanMount("rclone", "install", windows)).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      hint: expect.stringContaining("--install-deps has no pinned rclone for win32/x64")
    });
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("a raw error from the install (disk full) or from the question (Ctrl-C) still exits local-failed, with the hint", async () => {
    const full = machine({ rcloneRuns: false });
    runInstallPlan.mockRejectedValue(
      Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" })
    );
    await expect(ensureRcloneCanMount("direct", "install", full.io)).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: expect.stringContaining("The install failed: ENOSPC"),
      hint: expect.stringContaining("https://rclone.org/downloads/")
    });

    const interrupted = machine({ rcloneRuns: false });
    interrupted.io.askYesNo = async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    };
    await expect(ensureRcloneCanMount("direct", "ask", interrupted.io)).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: expect.stringContaining("The question failed: The operation was aborted")
    });
    expect(runInstallPlan).not.toHaveBeenCalled();
  });
});
