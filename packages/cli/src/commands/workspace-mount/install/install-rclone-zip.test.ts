import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import JSZip from "jszip";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it, so
// `~/.nexus-mcp/bin` below is this spec's own directory and never the developer's.
const SANDBOX = vi.hoisted(() => {
  // Joined by the host's own `path` (no import exists this early): one separator on Windows too.
  const dir = process
    .getBuiltinModule("node:path")
    .join(process.env.TMPDIR ?? "/tmp", `nexus-install-rclone-zip-${process.pid}`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { DepsIo, RunOutcome } from "../../../workspace-direct-mount/deps-io";
import {
  MANAGED_RCLONE_DIR,
  managedRcloneFor
} from "../../../workspace-direct-mount/managed-rclone";
import { installRcloneZip } from "./install-rclone-zip";

/** Where the zip lands on macOS and Linux: the POSIX spelling. */
const MANAGED = managedRcloneFor("darwin");
const MEMBER = "rclone-v1.74.4-osx-arm64/rclone";
const BINARY = "#!/bin/sh\necho fake rclone\n";

async function zipWith(member: string, content: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(member, content);
  return zip.generateAsync({ type: "uint8array" });
}

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * The real `unzip`, and canned answers for everything else. The inherited
 * environment carries credentials, so a spec can prove none reaches `unzip`.
 */
const io = (
  bytes: Uint8Array,
  run?: DepsIo["run"]
): DepsIo & { readonly runs: string[][]; readonly envs: NodeJS.ProcessEnv[] } => {
  const runs: string[][] = [];
  const envs: NodeJS.ProcessEnv[] = [];
  const realUnzip: DepsIo["run"] = (file, args, env): RunOutcome => {
    runs.push([file, ...args]);
    envs.push(env);
    execFileSync(file, [...args], { env, stdio: "ignore" });
    return { ok: true };
  };
  return {
    platform: "darwin",
    arch: "arm64",
    env: {
      PATH: process.env.PATH ?? "",
      NEXUS_API_KEY: "nxs_secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret"
    },
    stdinIsTTY: true,
    exists: (file) => fs.existsSync(file),
    rcloneVersion: () => null,
    macFuseApproved: () => "unknown",
    winFspInstallDir: () => "unknown",
    hasBrew: () => false,
    download: async () => bytes,
    run: run ?? realUnzip,
    askYesNo: vi.fn(),
    promptLine: vi.fn(),
    runs,
    envs
  };
};

describe("installRcloneZip — the binary reaches its path whole, or the disk is untouched", () => {
  beforeEach(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("download → verify → unzip one member → chmod → rename: the managed copy exists, executable, with the zip's bytes", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const fake = io(bytes);
    await installRcloneZip(fake, {
      url: "https://example.test/rclone.zip",
      sha256: sha(bytes),
      member: MEMBER
    });
    expect(fs.readFileSync(MANAGED, "utf-8")).toBe(BINARY);
    // The exec bit is a POSIX fact: NTFS has none to set.
    if (process.platform !== "win32") expect(fs.statSync(MANAGED).mode & 0o111).not.toBe(0);
    expect(fake.runs[0]?.slice(0, 4)).toEqual(["unzip", "-o", "-q", "-j"]);
    // Exactly the binary: no stage and no lock left beside it.
    expect(fs.readdirSync(MANAGED_RCLONE_DIR)).toEqual(["rclone"]);
    // unzip runs under the installers' ALLOW-list: PATH through, no credential.
    expect(fake.envs[0]?.PATH).toBe(process.env.PATH ?? "");
    expect(fake.envs[0]?.NEXUS_API_KEY).toBeUndefined();
    expect(fake.envs[0]?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("a hash mismatch writes nothing: no managed copy, no stage, no bin directory at all", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const attempt = installRcloneZip(io(bytes), {
      url: "u",
      sha256: "0".repeat(64),
      member: MEMBER
    });
    await expect(attempt).rejects.toMatchObject({ code: "CLI_LOCAL_FAILED" });
    expect(fs.existsSync(MANAGED_RCLONE_DIR)).toBe(false);
  });

  it("unzip missing → a refusal naming unzip; unzip failing → a refusal naming its exit; the stage is swept either way", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const spec = { url: "u", sha256: sha(bytes), member: MEMBER };
    // The listing at the end must find this marker, proving it read the bin folder.
    fs.mkdirSync(MANAGED_RCLONE_DIR, { recursive: true });
    fs.writeFileSync(path.join(MANAGED_RCLONE_DIR, "keep.marker"), "");
    const missing = io(bytes, () => ({ ok: false, reason: "not-found" }));
    await expect(installRcloneZip(missing, spec)).rejects.toMatchObject({
      message: expect.stringContaining("unzip is not installed")
    });
    const failing = io(bytes, () => ({ ok: false, reason: "exit", status: 9 }));
    await expect(installRcloneZip(failing, spec)).rejects.toMatchObject({
      message: expect.stringContaining("unzip exited 9")
    });
    // No binary, no stage, no lock — only the marker.
    expect(fs.readdirSync(MANAGED_RCLONE_DIR)).toEqual(["keep.marker"]);
  });

  it("Windows: tar unpacks one member, byte for byte, under the Windows allow-list, and rclone.exe lands beside the POSIX name", async () => {
    const member = "rclone-v1.74.4-windows-amd64/rclone.exe";
    const bytes = await zipWith(member, BINARY);
    // `tar` is faked: it writes the member where bsdtar would, so the rename has a file to move.
    const fakeTar: DepsIo["run"] = (_file, args, _env) => {
      const dir = args[args.indexOf("-C") + 1] ?? "";
      fs.writeFileSync(path.join(dir, "rclone.exe"), BINARY);
      return { ok: true };
    };
    const base = io(bytes, fakeTar);
    const fake = {
      ...base,
      platform: "win32" as const,
      arch: "x64" as const,
      env: { ...base.env, SystemRoot: "D:\\Win" }
    };
    const runs: string[][] = [];
    const envs: NodeJS.ProcessEnv[] = [];
    fake.run = (file, args, env) => {
      runs.push([file, ...args]);
      envs.push(env);
      return fakeTar(file, args, env);
    };
    await installRcloneZip(fake, { url: "u", sha256: sha(bytes), member });
    const zip = path.join(MANAGED_RCLONE_DIR, `.stage-${String(process.pid)}`, "rclone.zip");
    const stage = path.dirname(zip);
    // System32's bsdtar by full path: under Git Bash a bare `tar` is GNU tar, which cannot read a zip.
    expect(runs[0]).toEqual([
      "D:\\Win\\System32\\tar.exe",
      "-xf",
      zip,
      "-C",
      stage,
      "--strip-components=1",
      member
    ]);
    expect(envs[0]?.NEXUS_API_KEY).toBeUndefined();
    expect(envs[0]?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(fs.readFileSync(managedRcloneFor("win32"), "utf-8")).toBe(BINARY);
    expect(fs.readdirSync(MANAGED_RCLONE_DIR)).toEqual(["rclone.exe"]);
  });

  it("Windows: a tar that is not there names its full System32 path and the Windows build that ships it", async () => {
    const member = "rclone-v1.74.4-windows-amd64/rclone.exe";
    const bytes = await zipWith(member, BINARY);
    const fake = {
      ...io(bytes, () => ({ ok: false, reason: "not-found" })),
      platform: "win32" as const
    };
    await expect(
      installRcloneZip(fake, { url: "u", sha256: sha(bytes), member })
    ).rejects.toMatchObject({
      message: expect.stringContaining("C:\\Windows\\System32\\tar.exe is not installed"),
      hint: expect.stringContaining("Windows 10 1803")
    });
  });

  it("a first install whose fresh file an antivirus holds for a moment (EPERM, then free) still lands", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const realRename = fs.renameSync.bind(fs);
    const held = Object.assign(new Error("EPERM: operation not permitted, rename"), {
      code: "EPERM"
    });
    const rename = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce(() => {
        throw held;
      })
      .mockImplementation(realRename);
    try {
      await installRcloneZip(io(bytes), { url: "u", sha256: sha(bytes), member: MEMBER });
      expect(fs.readFileSync(MANAGED, "utf-8")).toBe(BINARY);
      expect(rename).toHaveBeenCalledTimes(2);
    } finally {
      rename.mockRestore();
    }
  });

  it("a rename held past the bounded retries refuses as in use, and tries a fixed number of times", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const busy = Object.assign(new Error("EBUSY: resource busy or locked, rename"), {
      code: "EBUSY"
    });
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw busy;
    });
    try {
      await expect(
        installRcloneZip(io(bytes), { url: "u", sha256: sha(bytes), member: MEMBER })
      ).rejects.toMatchObject({ message: expect.stringContaining("is in use") });
      expect(rename).toHaveBeenCalledTimes(10);
      expect(fs.existsSync(MANAGED)).toBe(false);
    } finally {
      rename.mockRestore();
    }
  });

  it("a stage an antivirus still holds after the retries is named and left: the install's own outcome stands", async () => {
    const bytes = await zipWith(MEMBER, BINARY);
    const held = Object.assign(new Error("EBUSY: resource busy or locked, rmdir"), {
      code: "EBUSY"
    });
    const realRm = fs.rmSync.bind(fs);
    const rm = vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).includes(".stage-")) throw held;
      realRm(target, options);
    });
    const installer = io(bytes);
    try {
      await installRcloneZip(installer, { url: "u", sha256: sha(bytes), member: MEMBER });
      expect(fs.readFileSync(MANAGED, "utf-8")).toBe(BINARY);
      expect(installer.promptLine).toHaveBeenCalledWith(expect.stringContaining(".stage-"));
    } finally {
      rm.mockRestore();
    }
  });

  it("replaces an existing managed copy in one rename", async () => {
    const first = await zipWith(MEMBER, "old\n");
    await installRcloneZip(io(first), { url: "u", sha256: sha(first), member: MEMBER });
    const second = await zipWith(MEMBER, BINARY);
    await installRcloneZip(io(second), { url: "u", sha256: sha(second), member: MEMBER });
    expect(fs.readFileSync(MANAGED, "utf-8")).toBe(BINARY);
    expect(path.dirname(MANAGED)).toBe(MANAGED_RCLONE_DIR);
  });
});
