import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import JSZip from "jszip";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it, so
// `~/.nexus-mcp/bin` below is this spec's own directory and never the developer's.
const SANDBOX = vi.hoisted(() => {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-install-rclone-zip-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { DepsIo, RunOutcome } from "../../../workspace-direct-mount/deps-io";
import { MANAGED_RCLONE, MANAGED_RCLONE_DIR } from "../../../workspace-direct-mount/managed-rclone";
import { installRcloneZip } from "./install-rclone-zip";

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
    expect(fs.readFileSync(MANAGED_RCLONE, "utf-8")).toBe(BINARY);
    expect(fs.statSync(MANAGED_RCLONE).mode & 0o111).not.toBe(0);
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

  it("replaces an existing managed copy in one rename", async () => {
    const first = await zipWith(MEMBER, "old\n");
    await installRcloneZip(io(first), { url: "u", sha256: sha(first), member: MEMBER });
    const second = await zipWith(MEMBER, BINARY);
    await installRcloneZip(io(second), { url: "u", sha256: sha(second), member: MEMBER });
    expect(fs.readFileSync(MANAGED_RCLONE, "utf-8")).toBe(BINARY);
    expect(path.dirname(MANAGED_RCLONE)).toBe(MANAGED_RCLONE_DIR);
  });
});
