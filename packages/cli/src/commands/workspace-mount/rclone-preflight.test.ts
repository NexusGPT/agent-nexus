import { describe, expect, it, vi } from "vitest";

import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import {
  FUSE_T_LIBRARY,
  LEGACY_MACFUSE_LIBRARY,
  MACFUSE_LIBRARY
} from "../../workspace-direct-mount/fuse-libraries";
import { MANAGED_RCLONE, PATH_RCLONE } from "../../workspace-direct-mount/managed-rclone";
import { rclonePreflight } from "./rclone-preflight";

const OFFICIAL = "rclone v1.74.4\n- go/tags: cmount\n";
const HOMEBREW = "rclone v1.74.4\n- go/tags: none\n";

interface Fake {
  readonly platform?: NodeJS.Platform;
  readonly present?: readonly string[];
  readonly version?: string | null;
  readonly approved?: boolean | "unknown";
  readonly env?: NodeJS.ProcessEnv;
}

/** A Mac with the official rclone on PATH and macFUSE approved, unless a case says otherwise. */
const io = (
  fake: Fake = {}
): DepsIo & { readonly calls: { version: string[]; approval: number } } => {
  const calls = { version: [] as string[], approval: 0 };
  const present = new Set(fake.present ?? [MACFUSE_LIBRARY]);
  return {
    platform: fake.platform ?? "darwin",
    arch: "arm64",
    env: fake.env ?? {},
    stdinIsTTY: true,
    exists: (file) => present.has(file),
    rcloneVersion: (binary) => {
      calls.version.push(binary);
      return fake.version === undefined ? OFFICIAL : fake.version;
    },
    macFuseApproved: () => {
      calls.approval += 1;
      return fake.approved ?? true;
    },
    hasBrew: () => true,
    download: vi.fn(),
    run: vi.fn(),
    askYesNo: vi.fn(),
    promptLine: vi.fn(),
    calls
  };
};

describe("rclonePreflight — which binary, and the two slots", () => {
  it("probes the managed copy when it exists, else the PATH name, and versions THAT binary", () => {
    const managed = io({ present: [MANAGED_RCLONE, MACFUSE_LIBRARY] });
    expect(rclonePreflight(managed).binary).toBe(MANAGED_RCLONE);
    expect(managed.calls.version).toEqual([MANAGED_RCLONE]);
    const onPath = io();
    expect(rclonePreflight(onPath).binary).toBe(PATH_RCLONE);
    expect(onPath.calls.version).toEqual([PATH_RCLONE]);
  });

  it("a healthy Mac: no problems in either slot", () => {
    expect(rclonePreflight(io()).problems).toEqual({ rclone: null, fuse: null });
  });

  it("rclone slot: missing when it cannot run; Homebrew's build on macOS cannot mount; on Linux the tag is not read", () => {
    expect(rclonePreflight(io({ version: null })).problems.rclone).toEqual({
      kind: "rclone-missing"
    });
    expect(rclonePreflight(io({ version: HOMEBREW })).problems.rclone).toEqual({
      kind: "no-mount-support",
      verdict: "no-mount-support"
    });
    expect(
      rclonePreflight(io({ platform: "linux", version: HOMEBREW })).problems.rclone
    ).toBeNull();
  });

  it("both slots are always filled: a missing rclone does not hide a missing plug", () => {
    expect(rclonePreflight(io({ version: null, present: [] })).problems).toEqual({
      rclone: { kind: "rclone-missing" },
      fuse: { kind: "no-fuse-library" }
    });
  });

  it("fuse slot: macFUSE present needs approval; unknown passes; FUSE-T alone never asks the loader", () => {
    expect(rclonePreflight(io({ approved: false })).problems.fuse).toEqual({
      kind: "macfuse-not-approved"
    });
    expect(rclonePreflight(io({ approved: "unknown" })).problems.fuse).toBeNull();
    const fuseT = io({ present: [FUSE_T_LIBRARY] });
    expect(rclonePreflight(fuseT).problems.fuse).toBeNull();
    expect(fuseT.calls.approval).toBe(0);
  });

  it("fuse slot: the loader's order is honoured — legacy macFUSE counts, and CGOFUSE_LIBFUSE_PATH wins first", () => {
    const legacy = io({ present: [LEGACY_MACFUSE_LIBRARY], approved: false });
    expect(rclonePreflight(legacy).problems.fuse).toEqual({ kind: "macfuse-not-approved" });
    const custom = io({
      present: ["/opt/local/lib/libfuse.2.dylib", MACFUSE_LIBRARY],
      approved: false,
      env: { CGOFUSE_LIBFUSE_PATH: "/opt/local/lib/libfuse.2.dylib" }
    });
    expect(rclonePreflight(custom).problems.fuse).toBeNull();
    expect(custom.calls.approval).toBe(0);
  });

  it("fuse slot: nothing on a Mac is a problem; off macOS the slot is never probed", () => {
    expect(rclonePreflight(io({ present: [] })).problems.fuse).toEqual({ kind: "no-fuse-library" });
    expect(rclonePreflight(io({ platform: "linux", present: [] })).problems.fuse).toBeNull();
    expect(rclonePreflight(io({ platform: "win32", present: [] })).problems.fuse).toBeNull();
  });
});
