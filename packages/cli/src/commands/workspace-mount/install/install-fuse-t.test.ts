import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it.
const SANDBOX = vi.hoisted(() => {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-install-fuse-t-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { DepsIo, RunOutcome } from "../../../workspace-direct-mount/deps-io";
import { DIALOG_PROMPT, installFuseTCask, installFuseTPkg } from "./install-fuse-t";

const PKG = new TextEncoder().encode("a fake installer");
const SHA = createHash("sha256").update(PKG).digest("hex");
const SPEC = {
  url: "https://example.test/fuse-t.pkg",
  sha256: SHA,
  name: "fuse-t-macos-installer-1.2.7.pkg",
  password: "terminal"
} as const;
const CASK = "macos-fuse-t/homebrew-cask/fuse-t";

/**
 * "Nothing left in downloads" needs proof the listing read the RIGHT folder:
 * a marker planted first must be the one entry found after the run. An empty
 * listing alone is also what a wrong path or a missing folder would give.
 */
const DOWNLOADS = path.join(SANDBOX, ".nexus-mcp", "downloads");
const MARKER = "keep.marker";
function plantMarker(): void {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  fs.writeFileSync(path.join(DOWNLOADS, MARKER), "");
}

interface Seen {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly pkgExistedWhenRun: boolean;
}

const io = (answer: RunOutcome): DepsIo & { readonly seen: Seen[] } => {
  const seen: Seen[] = [];
  return {
    platform: "darwin",
    arch: "arm64",
    env: { PATH: "/opt/homebrew/bin:/usr/bin", HOME: SANDBOX, NEXUS_API_KEY: "nx-secret" },
    stdinIsTTY: true,
    exists: () => false,
    rcloneVersion: () => null,
    macFuseApproved: () => "unknown",
    hasBrew: () => true,
    download: async () => PKG,
    run: (file, args, env) => {
      // osascript takes the pkg as its last argument; sudo right after -pkg.
      const pkgArg = file === "osascript" ? args[args.length - 1] : args[args.indexOf("-pkg") + 1];
      seen.push({
        file,
        args,
        env,
        pkgExistedWhenRun: pkgArg !== undefined && fs.existsSync(pkgArg)
      });
      return answer;
    },
    askYesNo: vi.fn(),
    promptLine: vi.fn(),
    seen
  };
};

describe("installFuseTCask — the brew road", () => {
  it("runs exactly one brew command under the allow-listed env", () => {
    const fake = io({ ok: true });
    installFuseTCask(fake, CASK);
    expect(fake.seen).toHaveLength(1);
    expect(fake.seen[0]?.file).toBe("brew");
    expect(fake.seen[0]?.args).toEqual(["install", CASK]);
    expect(fake.seen[0]?.env.HOMEBREW_NO_AUTO_UPDATE).toBe("1");
    expect(fake.seen[0]?.env.NEXUS_API_KEY).toBeUndefined();
  });

  it("brew gone since it was probed → names brew; brew failing → names the exit", () => {
    expect(() => installFuseTCask(io({ ok: false, reason: "not-found" }), CASK)).toThrow(
      /brew is not installed/
    );
    expect(() => installFuseTCask(io({ ok: false, reason: "exit", status: 1 }), CASK)).toThrow(
      /exited 1/
    );
  });
});

describe("installFuseTPkg — the pkg road", () => {
  beforeEach(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("verifies, writes the pkg under ~/.nexus-mcp/downloads with a per-process name, runs sudo installer on it, removes it", async () => {
    const fake = io({ ok: true });
    await installFuseTPkg(fake, SPEC);
    const [run] = fake.seen;
    expect(run?.file).toBe("sudo");
    expect(run?.args.slice(0, 3)).toEqual([
      "installer",
      "-pkg",
      expect.stringMatching(/\/\d+-fuse-t-macos-installer-1\.2\.7\.pkg$/)
    ]);
    // Apple's `installer` refuses a -pkg path that does not END in `.pkg`
    // ("the package path specified was invalid"), so the pid goes in front.
    expect(run?.args[2]?.endsWith(".pkg")).toBe(true);
    expect(run?.args.slice(3)).toEqual(["-target", "/"]);
    expect(path.dirname(run?.args[2] ?? "")).toBe(path.join(SANDBOX, ".nexus-mcp", "downloads"));
    expect(run?.pkgExistedWhenRun).toBe(true);
    expect(fs.existsSync(run?.args[2] ?? "")).toBe(false);
    expect(run?.env.NEXUS_API_KEY).toBeUndefined();
  });

  it("no terminal: the macOS password window runs installer on the pkg, passed as an argument, never spliced into the script", async () => {
    const fake = io({ ok: true });
    await installFuseTPkg(fake, { ...SPEC, password: "dialog" });
    const [run] = fake.seen;
    expect(run?.file).toBe("osascript");
    const pkg = run?.args[run.args.length - 1] ?? "";
    expect(pkg).toMatch(/\/\d+-fuse-t-macos-installer-1\.2\.7\.pkg$/);
    // The whole argv, not fragments: the handler that receives the path, the
    // absolute installer, the target, the prompt, the privilege — in order.
    expect(run?.args).toEqual([
      "-e",
      "on run argv",
      "-e",
      'do shell script "/usr/sbin/installer -pkg " & quoted form of (item 1 of argv) & " -target /" ' +
        `with prompt "${DIALOG_PROMPT}" with administrator privileges`,
      "-e",
      "end run",
      pkg
    ]);
    const script = run?.args.slice(0, -1).join("\n") ?? "";
    expect(script).toContain("with administrator privileges");
    // The window names Nexus and the reason, not "osascript wants to make changes".
    expect(script).toContain(`with prompt "${DIALOG_PROMPT}"`);
    expect(DIALOG_PROMPT).not.toMatch(/["\\]/);
    expect(script).toContain("quoted form of (item 1 of argv)");
    expect(script).not.toContain(pkg);
    expect(run?.pkgExistedWhenRun).toBe(true);
    expect(fs.existsSync(pkg)).toBe(false);
    expect(run?.env.NEXUS_API_KEY).toBeUndefined();
  });

  it("the password window cancelled → a refusal that names the window, and the pkg is removed", async () => {
    plantMarker();
    const fake = io({ ok: false, reason: "exit", status: 1 });
    await expect(installFuseTPkg(fake, { ...SPEC, password: "dialog" })).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      hint: expect.stringContaining("password window is cancelled")
    });
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  it("a hash mismatch writes nothing, not even the downloads directory", async () => {
    const fake = io({ ok: true });
    await expect(installFuseTPkg(fake, { ...SPEC, sha256: "0".repeat(64) })).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED"
    });
    expect(fake.seen).toHaveLength(0);
    expect(fs.existsSync(path.join(SANDBOX, ".nexus-mcp", "downloads"))).toBe(false);
  });

  it("a write that fails half way (disk full) leaves no partial pkg behind", async () => {
    plantMarker();
    const fake = io({ ok: true });
    const realWrite = fs.writeFileSync;
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(((
      file: fs.PathOrFileDescriptor
    ) => {
      realWrite(file, "half a pkg");
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    }) as typeof fs.writeFileSync);
    try {
      await expect(installFuseTPkg(fake, SPEC)).rejects.toThrow(/ENOSPC/);
    } finally {
      writeSpy.mockRestore();
    }
    expect(fake.seen).toHaveLength(0);
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });

  it("a declined password (exit 1) refuses and still removes the pkg", async () => {
    plantMarker();
    const fake = io({ ok: false, reason: "exit", status: 1 });
    await expect(installFuseTPkg(fake, SPEC)).rejects.toThrow(/exited 1/);
    expect(fs.readdirSync(DOWNLOADS)).toEqual([MARKER]);
  });
});
