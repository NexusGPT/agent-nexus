import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it, so
// `~/.nexus-mcp/downloads` below is this spec's own directory.
const SANDBOX = vi.hoisted(() => {
  // Joined by the host's own `path` (no import exists this early): one separator on Windows too.
  const dir = process
    .getBuiltinModule("node:path")
    .join(process.env.TMPDIR ?? "/tmp", `nexus-install-winfsp-msi-${process.pid}`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { DepsIo, RunOutcome } from "../../../../workspace-direct-mount/deps-io";
import {
  elevateMsiRoad,
  WINFSP_LOG_ENV,
  WINFSP_MSI_ENV,
  WINFSP_SHA256_ENV
} from "../../../../workspace-direct-mount/install/win32/elevate-msi";
import { winFspRestartMarker } from "../../../../workspace-direct-mount/install/win32/winfsp-restart-marker";
import { installWinFspMsi } from "./install-winfsp-msi";

const MSI = new TextEncoder().encode("not really an msi");
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const SPEC = {
  url: "https://example.test/winfsp.msi",
  sha256: sha(MSI),
  name: "winfsp-2.1.25156.msi"
};
const DOWNLOADS = path.join(SANDBOX, ".nexus-mcp", "downloads");
/** A file the folder listings must still find, proving they read the right folder. */
const MARKER = "keep.marker";

interface Seen {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly msiExistedWhenRun: boolean;
}

/** msiexec is faked: it answers what a case says, and writes the log a real one would. */
const io = (answer: RunOutcome, writeLog = true): DepsIo & { readonly seen: Seen[] } => {
  const seen: Seen[] = [];
  return {
    platform: "win32",
    arch: "x64",
    env: { Path: "C:\\Windows\\System32", NEXUS_API_KEY: "nxs_secret", ComSpec: "cmd.exe" },
    stdinIsTTY: true,
    exists: () => false,
    rcloneVersion: () => null,
    macFuseApproved: () => "unknown",
    winFspInstallDir: () => null,
    hasBrew: () => false,
    download: async () => MSI,
    run: (file, args, env) => {
      const msi = env[WINFSP_MSI_ENV] ?? "";
      const log = env[WINFSP_LOG_ENV] ?? "";
      if (writeLog && log !== "") fs.writeFileSync(log, "MSI (s) (00:00) verbose log\n");
      seen.push({ file, args, env, msiExistedWhenRun: msi !== "" && fs.existsSync(msi) });
      return answer;
    },
    askYesNo: vi.fn(),
    promptLine: vi.fn(),
    seen
  };
};

function plantMarker(): void {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  fs.writeFileSync(path.join(DOWNLOADS, MARKER), "");
}

describe("installWinFspMsi — the MSI reaches msiexec behind UAC, and the folder is left as it was", () => {
  beforeEach(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("verifies, writes the MSI under downloads with a per-process name, runs the road with both paths and the pin's hash in env, removes MSI and log on 0", async () => {
    plantMarker();
    const fake = io({ ok: true });
    await installWinFspMsi(fake, SPEC);
    const run = fake.seen[0];
    expect(run?.file).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(run?.args).toEqual(elevateMsiRoad(fake.env).args);
    expect(run?.msiExistedWhenRun).toBe(true);
    expect(run?.env[WINFSP_MSI_ENV]).toBe(
      path.join(DOWNLOADS, `${String(process.pid)}-winfsp-2.1.25156.msi`)
    );
    expect(run?.env[WINFSP_LOG_ENV]).toBe(
      path.join(DOWNLOADS, `${String(process.pid)}-winfsp.log`)
    );
    // The road re-hashes the file it holds open; the pin it compares to is the spec's, verbatim.
    expect(run?.env[WINFSP_SHA256_ENV]).toBe(SPEC.sha256);
    // The Windows allow-list: Path and ComSpec through, no credential.
    expect(run?.env.Path).toBe("C:\\Windows\\System32");
    expect(run?.env.ComSpec).toBe("cmd.exe");
    expect(run?.env.NEXUS_API_KEY).toBeUndefined();
    // Nothing of this run is left behind: not the MSI, not the log.
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  it("the UAC prompt declined (1223) → the standard user's sentence; the MSI is removed, and so is a log the refusal does not name", async () => {
    plantMarker();
    await expect(
      installWinFspMsi(io({ ok: false, reason: "exit", status: 1223 }), SPEC)
    ).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      hint: expect.stringContaining("administrator")
    });
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  it("another installer running (1618) names no log, so none is left to pile up on each retry", async () => {
    plantMarker();
    await expect(
      installWinFspMsi(io({ ok: false, reason: "exit", status: 1618 }), SPEC)
    ).rejects.toMatchObject({ message: "Another installer is running." });
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  it("3010 → refused with the restart sentence, never a success", async () => {
    await expect(
      installWinFspMsi(io({ ok: false, reason: "exit", status: 3010 }), SPEC)
    ).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: expect.stringContaining("restart Windows, then mount again")
    });
    // The next mount of this boot reads the marker and refuses until the restart.
    expect(fs.existsSync(winFspRestartMarker())).toBe(true);
  });

  it("1603 → the refusal names the log that survived", async () => {
    await expect(
      installWinFspMsi(io({ ok: false, reason: "exit", status: 1603 }), SPEC)
    ).rejects.toMatchObject({
      hint: expect.stringContaining(`${String(process.pid)}-winfsp.log`)
    });
    expect(fs.existsSync(path.join(DOWNLOADS, `${String(process.pid)}-winfsp.log`))).toBe(true);
  });

  it("PowerShell missing, or started and gone with no exit code → a refusal naming PowerShell, never an msiexec sentence; the MSI is removed", async () => {
    plantMarker();
    await expect(
      installWinFspMsi(io({ ok: false, reason: "not-found" }, false), SPEC)
    ).rejects.toMatchObject({
      message: expect.stringContaining("PowerShell could not be run")
    });
    await expect(
      installWinFspMsi(io({ ok: false, reason: "exit", status: null }, false), SPEC)
    ).rejects.toMatchObject({
      message: expect.stringContaining("PowerShell could not be run")
    });
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  describe("an antivirus holding the MSI or the log (rmSync throws EBUSY once) never replaces the verdict", () => {
    const busyOnce = () => {
      const realRm = fs.rmSync.bind(fs);
      let thrown = false;
      return vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
        if (!thrown && String(target).startsWith(DOWNLOADS)) {
          thrown = true;
          throw Object.assign(new Error("EBUSY: resource busy or locked, rm"), { code: "EBUSY" });
        }
        realRm(target, options);
      });
    };

    it("msiexec answered 0 → the caller gets the success, and each removal retries on its own", async () => {
      const rm = busyOnce();
      try {
        await expect(installWinFspMsi(io({ ok: true }), SPEC)).resolves.toBeUndefined();
        const msi = path.join(DOWNLOADS, `${String(process.pid)}-winfsp-2.1.25156.msi`);
        expect(rm).toHaveBeenCalledWith(
          msi,
          expect.objectContaining({ force: true, recursive: true, maxRetries: 10, retryDelay: 100 })
        );
      } finally {
        rm.mockRestore();
      }
    });

    it("msiexec answered 1223 → the caller gets the standard user's refusal, not the EBUSY", async () => {
      const rm = busyOnce();
      try {
        await expect(
          installWinFspMsi(io({ ok: false, reason: "exit", status: 1223 }), SPEC)
        ).rejects.toMatchObject({
          code: "CLI_LOCAL_FAILED",
          hint: expect.stringContaining("administrator")
        });
      } finally {
        rm.mockRestore();
      }
    });
  });

  it("a hash mismatch writes nothing, not even the downloads directory", async () => {
    await expect(
      installWinFspMsi(io({ ok: true }), { ...SPEC, sha256: "0".repeat(64) })
    ).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED"
    });
    expect(fs.existsSync(DOWNLOADS)).toBe(false);
  });
});
