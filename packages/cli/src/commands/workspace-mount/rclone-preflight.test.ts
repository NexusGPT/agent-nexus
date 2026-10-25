import { describe, expect, it, vi } from "vitest";

import {
  FUSE_T_LIBRARY,
  LEGACY_MACFUSE_LIBRARY,
  MACFUSE_LIBRARY
} from "../../workspace-direct-mount/darwin/fuse-libraries";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { winFspRestartMarker } from "../../workspace-direct-mount/install/win32/winfsp-restart-marker";
import { managedRcloneFor, PATH_RCLONE } from "../../workspace-direct-mount/managed-rclone";
import { rclonePreflight } from "./rclone-preflight";

/** The managed copy's path on the platform this spec fakes: the POSIX spelling. */
const MANAGED = managedRcloneFor("darwin");
const OFFICIAL = "rclone v1.74.4\n- go/tags: cmount\n";
const HOMEBREW = "rclone v1.74.4\n- go/tags: none\n";

interface Fake {
  readonly platform?: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture;
  readonly present?: readonly string[];
  readonly version?: string | null | { readonly refused: string };
  readonly approved?: boolean | "unknown";
  readonly winFsp?: ReturnType<DepsIo["winFspInstallDir"]>;
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
    arch: fake.arch ?? "arm64",
    env: fake.env ?? {},
    stdinIsTTY: true,
    exists: (file) => present.has(file),
    // A file that is not there answers ENOENT (null), as the real probe does; the
    // PATH name stands for a binary PATH resolves.
    rcloneVersion: (binary) => {
      calls.version.push(binary);
      if (binary !== PATH_RCLONE && !present.has(binary)) return null;
      return fake.version === undefined ? OFFICIAL : fake.version;
    },
    macFuseApproved: () => {
      calls.approval += 1;
      return fake.approved ?? true;
    },
    // Not `??`: `null` is a real answer here (the key is absent).
    winFspInstallDir: () => (fake.winFsp === undefined ? "unknown" : fake.winFsp),
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
    const managed = io({ present: [MANAGED, MACFUSE_LIBRARY] });
    expect(rclonePreflight(managed).binary).toBe(MANAGED);
    expect(managed.calls.version).toEqual([MANAGED]);
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

  it("fuse slot: nothing on a Mac is a problem; on Linux the FUSE device is the whole question", () => {
    expect(rclonePreflight(io({ present: [] })).problems.fuse).toEqual({ kind: "no-fuse-library" });
    expect(
      rclonePreflight(io({ platform: "linux", present: ["/dev/fuse"] })).problems.fuse
    ).toBeNull();
    expect(rclonePreflight(io({ platform: "linux", present: [] })).problems.fuse).toEqual({
      kind: "no-fuse-device"
    });
    // FreeBSD lands on the linux row, device and all.
    expect(
      rclonePreflight(io({ platform: "freebsd", present: ["/dev/fuse"] })).problems.fuse
    ).toBeNull();
  });

  it("fuse slot on Windows: WinFsp's key AND its DLL for this CPU, or no-winfsp; a key it could not read passes", () => {
    const dir = "C:\\Program Files (x86)\\WinFsp";
    const dll = `${dir}\\bin\\winfsp-x64.dll`;
    const win = (fake: Fake) => rclonePreflight(io({ platform: "win32", arch: "x64", ...fake }));
    expect(win({ winFsp: { dir }, present: [dll] }).problems.fuse).toBeNull();
    expect(win({ winFsp: null, present: [dll] }).problems.fuse).toEqual({ kind: "no-winfsp" });
    expect(win({ winFsp: { dir }, present: [] }).problems.fuse).toEqual({ kind: "no-winfsp" });
    expect(win({ winFsp: "unknown", present: [] }).problems.fuse).toBeNull();
    // An install of THIS boot asked for a restart: refused until Windows restarts, even with the DLL in place.
    expect(win({ winFsp: { dir }, present: [dll, winFspRestartMarker()] }).problems.fuse).toEqual({
      kind: "winfsp-restart-pending"
    });
    // A marker from another boot is a restart that already happened.
    expect(
      win({ winFsp: { dir }, present: [dll, winFspRestartMarker(1)] }).problems.fuse
    ).toBeNull();
    // The arm64 DLL carries WinFsp's own `a64` spelling.
    expect(
      rclonePreflight(
        io({
          platform: "win32",
          arch: "arm64",
          winFsp: { dir },
          present: [`${dir}\\bin\\winfsp-a64.dll`]
        })
      ).problems.fuse
    ).toBeNull();
  });

  it("rclone slot: a file the OS refused to run is named with its errno, never read as missing", () => {
    const WIN_MANAGED = managedRcloneFor("win32");
    const blocked = io({
      platform: "win32",
      version: { refused: "EACCES" },
      present: [WIN_MANAGED]
    });
    expect(rclonePreflight(blocked).problems.rclone).toEqual({
      kind: "rclone-blocked",
      path: WIN_MANAGED,
      code: "EACCES"
    });
    const missing = io({ platform: "win32", version: null });
    expect(rclonePreflight(missing).problems.rclone).toEqual({ kind: "rclone-missing" });
  });

  it("on Windows an rclone found by name is never probed nor run: without the managed copy the slot is missing, so the offer installs it", () => {
    const onPathOnly = io({ platform: "win32", version: OFFICIAL, present: [] });
    const result = rclonePreflight(onPathOnly);
    expect(result.binary).toBe(managedRcloneFor("win32"));
    expect(result.problems.rclone).toEqual({ kind: "rclone-missing" });
    expect(onPathOnly.calls.version).not.toContain(PATH_RCLONE);
  });
});
