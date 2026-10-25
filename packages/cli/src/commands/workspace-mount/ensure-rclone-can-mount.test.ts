import { describe, expect, it, vi } from "vitest";

// The install itself is faked: this spec pins the conversation and the exits.
// The fake "installs" by making the managed copy exist for the re-probe.
const runInstallPlan = vi.hoisted(() => vi.fn());
vi.mock("./install/run-install-plan", () => ({ runInstallPlan }));

import {
  FUSE_T_LIBRARY,
  MACFUSE_LIBRARY
} from "../../workspace-direct-mount/darwin/fuse-libraries";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { managedRcloneFor, PATH_RCLONE } from "../../workspace-direct-mount/managed-rclone";
import { ensureRcloneCanMount } from "./ensure-rclone-can-mount";
import { noTtyHint } from "./preflight-refusals";
import { rcloneReadiness } from "./rclone-readiness";

/** The managed copy's path on the platforms this spec fakes (macOS, Linux): the POSIX spelling. */
const MANAGED = managedRcloneFor("darwin");
const OFFICIAL = "rclone v1.74.4\n- go/tags: cmount\n";

interface Machine {
  readonly platform?: NodeJS.Platform;
  readonly present?: string[];
  readonly rcloneRuns?: boolean;
  /** The OS refused the file with this errno: the Windows block, never a reinstall. */
  readonly rcloneRefused?: string;
  readonly approved?: boolean | "unknown";
  readonly winFsp?: ReturnType<DepsIo["winFspInstallDir"]>;
  readonly tty?: boolean;
  readonly answer?: boolean;
}

/** A Mac with rclone on PATH and macFUSE approved unless the case says otherwise. */
const machine = (m: Machine = {}) => {
  const present = new Set(m.present ?? [MACFUSE_LIBRARY]);
  const printed: string[] = [];
  const asked: string[] = [];
  const io: DepsIo = {
    platform: m.platform ?? "darwin",
    arch: "arm64",
    env: {},
    stdinIsTTY: m.tty ?? true,
    exists: (file) => present.has(file),
    rcloneVersion: (binary) => {
      if (m.rcloneRefused !== undefined) return { refused: m.rcloneRefused };
      return binary === MANAGED || (m.rcloneRuns ?? true) ? OFFICIAL : null;
    },
    macFuseApproved: () => m.approved ?? true,
    // Not `??`: `null` is a real answer here (the key is absent).
    winFspInstallDir: () => (m.winFsp === undefined ? "unknown" : m.winFsp),
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
    if (steps.some((s) => s.kind === "rclone-zip")) present.add(MANAGED);
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

  it("Windows, WinFsp not installed, --no-install-deps → today's refusal naming WinFsp and the administrator", async () => {
    const m = machine({ platform: "win32", winFsp: null });
    await expect(ensureRcloneCanMount("rclone", "never", m.io)).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: expect.stringContaining("needs WinFsp"),
      hint: expect.stringContaining("WinFsp needs an administrator")
    });
    expect(m.printed).toEqual([]);
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("Windows, WinFsp not installed, --install-deps → the offer names the UAC prompt and the one MSI step runs", async () => {
    const m = machine({ platform: "win32", winFsp: null });
    await ensureRcloneCanMount("rclone", "install", m.io).catch(() => undefined);
    expect(m.printed.join("\n")).toContain("Windows shows its UAC prompt");
    expect(m.printed.join("\n")).toContain("msiexec /i winfsp-2.1.25156.msi /qn /norestart");
    expect(runInstallPlan).toHaveBeenCalledWith(m.io, [{ kind: "winfsp-msi" }]);
  });

  it("an rclone the OS refused → named with its errno and never reinstalled, whatever the policy", async () => {
    for (const policy of ["ask", "install", "never"] as const) {
      const m = machine({ platform: "win32", rcloneRefused: "EACCES" });
      await expect(ensureRcloneCanMount("rclone", policy, m.io)).rejects.toMatchObject({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining("refused to run it (EACCES)")
      });
    }
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("a manual plan's refusal opens with the problem that made it manual: Linux with no rclone AND no /dev/fuse names /dev/fuse first", async () => {
    for (const policy of ["ask", "install"] as const) {
      const m = machine({ platform: "linux", present: [], rcloneRuns: false });
      await expect(ensureRcloneCanMount("rclone", policy, m.io)).rejects.toMatchObject({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringMatching(
          /^[^\n]*needs the FUSE device \/dev\/fuse[^\n]*\n[^\n]*needs rclone, and none was found on PATH\.$/
        )
      });
      expect(m.printed).toEqual([]);
    }
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("no terminal on Windows → the hint names winpty and Windows Terminal before the flag; nowhere else", () => {
    // Reached through the offer only once a Windows build is pinned (no steps
    // plan exists on win32 yet), so the hint is pinned here at its own seam.
    expect(noTtyHint("win32")).toContain("winpty nexus");
    expect(noTtyHint("win32")).toContain("--install-deps");
    expect(noTtyHint("darwin")).not.toContain("winpty");
    expect(noTtyHint("linux")).not.toContain("winpty");
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
    await expect(ensureRcloneCanMount("direct", "ask", m.io)).resolves.toBe(MANAGED);
    expect(runInstallPlan).toHaveBeenCalledWith(m.io, [
      { kind: "rclone-zip", target: "osx-arm64" }
    ]);
  });

  it("--install-deps → no question; both missing → one plan of two steps, rclone first", async () => {
    const m = machine({ rcloneRuns: false, present: [] });
    await expect(ensureRcloneCanMount("direct", "install", m.io)).resolves.toBe(MANAGED);
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
      m.present.add(MANAGED); // the plug never appeared
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

  it("--install-deps where no pinned rclone exists (32-bit Windows) says the flag had nothing to install", async () => {
    const m = machine({ rcloneRuns: false });
    const windows: DepsIo = { ...m.io, platform: "win32", arch: "ia32" };
    await expect(ensureRcloneCanMount("rclone", "install", windows)).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      hint: expect.stringContaining("--install-deps has no pinned rclone for win32/ia32")
    });
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("a raw error from the install (disk full) exits local-failed with the hint; Ctrl-C at the question exits interrupted", async () => {
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
      code: "CLI_INTERRUPTED",
      exitCode: 130,
      message: "The question was interrupted. Nothing was mounted."
    });
    expect(runInstallPlan).not.toHaveBeenCalled();
  });
});

describe("rcloneReadiness — the same road for auto, every refusal a value", () => {
  it("returns a broken question and a broken install as refusals, worded for no flag", async () => {
    const unreadable = machine({ rcloneRuns: false });
    unreadable.io.askYesNo = async () => {
      throw Object.assign(new Error("read EIO"), { code: "EIO" });
    };
    await expect(rcloneReadiness("auto", "ask", { io: unreadable.io })).resolves.toMatchObject({
      ok: false,
      refusal: { code: "CLI_LOCAL_FAILED", message: expect.stringContaining("The question failed") }
    });

    const broken = machine({ rcloneRuns: false, answer: true });
    runInstallPlan.mockRejectedValueOnce(new Error("disk full"));
    await expect(rcloneReadiness("auto", "ask", { io: broken.io })).resolves.toMatchObject({
      ok: false,
      refusal: { message: expect.stringContaining("The install failed: disk full") }
    });
    expect(broken.printed.join("\n")).toContain("This mount needs rclone");
    expect(broken.printed.join("\n")).not.toContain("--engine");
  });

  it("THROWS a Ctrl-C at the question: the person stopped the command, so no caller may fall back and mount", async () => {
    const interrupted = machine({ rcloneRuns: false });
    interrupted.io.askYesNo = async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    };
    await expect(rcloneReadiness("auto", "ask", { io: interrupted.io })).rejects.toMatchObject({
      code: "CLI_INTERRUPTED",
      exitCode: 130,
      message: "The question was interrupted. Nothing was mounted."
    });
    expect(runInstallPlan).not.toHaveBeenCalled();
  });

  it("with no terminal, prints the offer it cannot make only when the caller has nowhere else to go", async () => {
    const quiet = machine({ rcloneRuns: false, tty: false });
    await expect(
      rcloneReadiness("auto", "ask", { io: quiet.io, offerWithoutTerminal: false })
    ).resolves.toMatchObject({
      ok: false,
      refusal: { message: expect.stringContaining("This mount needs rclone") }
    });
    expect(quiet.printed).toEqual([]);

    const loud = machine({ rcloneRuns: false, tty: false });
    await rcloneReadiness("auto", "ask", { io: loud.io });
    expect(loud.printed.join("\n")).toContain("The CLI can install what is missing");
  });
});
