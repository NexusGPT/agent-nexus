import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureSecretDir,
  resetLoosePermissionWarning,
  warnIfLoosePermissions,
  writeSecretFile
} from "./secret-file";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE TEST THAT MATTERS STARTS FROM A FILE THAT ALREADY EXISTS, LOOSE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A suite that only ever writes to a FRESH path passes against the broken code,
 * because `mode: 0o600` works perfectly at create — that is the entire defect.
 * It is also the obvious suite to write, which is why the fresh-path cases below
 * are labelled as controls rather than as the guarantee.
 *
 * The guarantee is the two cases named "pre-existing": chmod the target to 0644
 * (file) or 0755 (directory) FIRST, write through the helper, then read the mode
 * back. Remove the `chmodOrWarn` calls from `secret-file.ts` and only those two
 * go red.
 *
 * ⚠️ EVERY STARTING MODE IS SET EXPLICITLY WITH `fs.chmodSync`, AND EVERY
 * ASSERTION MASKS WITH `& 0o777`. A test that let the developer's umask choose
 * the starting mode would pass or fail depending on whose shell ran it, and
 * `fs.Stats.mode` carries the file-type bits alongside the permission bits.
 */

const MODE = (target: string): number => fs.statSync(target).mode & 0o777;

/**
 * Run `body` with `process.platform` reporting `platform`.
 *
 * `process.platform` is a configurable, non-writable data property, so it is
 * redefined rather than assigned — and restored to its real descriptor in a
 * `finally`, because leaking a fake platform would corrupt every later file in
 * the run rather than fail this one.
 */
function withPlatform(platform: string, body: () => void): void {
  const real = Object.getOwnPropertyDescriptor(process, "platform");
  if (!real) throw new Error("process.platform has no descriptor to restore");
  Object.defineProperty(process, "platform", { ...real, value: platform });
  try {
    body();
  } finally {
    Object.defineProperty(process, "platform", real);
  }
}

/**
 * NTFS carries no POSIX mode: Node reports 0666 or 0444 there, and `chmod`
 * moves only the read-only flag. A case that sets a mode and reads it back, or
 * needs the loose-mode warning to fire, runs on a POSIX host only.
 */
const onPosixHost = it.skipIf(process.platform === "win32");

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-secret-file-"));
  resetLoosePermissionWarning();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("writeSecretFile", () => {
  onPosixHost("leaves a PRE-EXISTING 0644 file at 0600", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o644);
    expect(MODE(file)).toBe(0o644); // the precondition is real, not assumed

    writeSecretFile(file, '{"apiKey":"x"}\n');

    expect(MODE(file)).toBe(0o600);
    expect(fs.readFileSync(file, "utf-8")).toBe('{"apiKey":"x"}\n');
  });

  onPosixHost("leaves a PRE-EXISTING 0755 directory at 0700", () => {
    const dir = path.join(root, "dot-nexus-mcp");
    fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o755);
    expect(MODE(dir)).toBe(0o755); // the precondition is real, not assumed

    writeSecretFile(path.join(dir, "config.json"), "{}\n");

    expect(MODE(dir)).toBe(0o700);
  });

  onPosixHost("repairs a world-WRITABLE file too, not only a readable one", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o666);

    writeSecretFile(file, "{}\n");

    expect(MODE(file)).toBe(0o600);
  });

  // ── Controls. These pass against the BROKEN code and prove nothing on their
  //    own; they are here so a regression that breaks the create path is caught
  //    too.
  onPosixHost("control: a fresh file is created at 0600", () => {
    const file = path.join(root, "fresh", "config.json");
    writeSecretFile(file, "{}\n");
    expect(MODE(file)).toBe(0o600);
  });

  onPosixHost("control: a fresh parent directory is created at 0700", () => {
    const file = path.join(root, "fresh", "config.json");
    writeSecretFile(file, "{}\n");
    expect(MODE(path.dirname(file))).toBe(0o700);
  });
});

describe("ensureSecretDir", () => {
  onPosixHost("leaves a PRE-EXISTING 0755 directory at 0700", () => {
    const dir = path.join(root, "logs-parent");
    fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o755);

    ensureSecretDir(dir);

    expect(MODE(dir)).toBe(0o700);
  });

  onPosixHost("does not tighten a parent it merely walked through", () => {
    const parent = path.join(root, "home");
    fs.mkdirSync(parent);
    fs.chmodSync(parent, 0o755);

    ensureSecretDir(path.join(parent, "child"));

    expect(MODE(path.join(parent, "child"))).toBe(0o700);
    expect(MODE(parent)).toBe(0o755);
  });
});

describe("warnIfLoosePermissions", () => {
  const captureStderr = (): string[] => {
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  };

  onPosixHost("names the file and tells the user to rotate when the mode is 0644", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o644);
    const lines = captureStderr();

    warnIfLoosePermissions(file);

    expect(lines.join("")).toContain(file);
    expect(lines.join("")).toContain("0644");
    expect(lines.join("")).toContain("rotate");
  });

  it("says nothing when the mode is already 0600", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o600);
    const lines = captureStderr();

    warnIfLoosePermissions(file);

    expect(lines).toEqual([]);
  });

  it("says nothing about a file that does not exist", () => {
    const lines = captureStderr();
    warnIfLoosePermissions(path.join(root, "absent.json"));
    expect(lines).toEqual([]);
  });

  onPosixHost("warns once per process, however many reads happen", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o644);
    const lines = captureStderr();

    warnIfLoosePermissions(file);
    warnIfLoosePermissions(file);
    warnIfLoosePermissions(file);

    expect(lines).toHaveLength(1);
  });

  it("stays silent on Windows, where 0666 is what a correct secret file reports", () => {
    // Node synthesises the mode on Windows from the read-only bit alone, so the
    // group/other bits are noise. Reading them as an exposure fired the warning
    // on EVERY loadConfig, on every invocation, and it never cleared — including
    // immediately after a successful write. Found by review, not by this suite.
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o666);
    const lines = captureStderr();

    withPlatform("win32", () => warnIfLoosePermissions(file));

    expect(lines).toEqual([]);
  });

  it("still warns on the same 0666 file when the platform is POSIX", () => {
    // The control for the case above. Without it, a `return` at the top of the
    // function would satisfy the Windows test and silence every platform.
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o666);
    const lines = captureStderr();

    withPlatform("linux", () => warnIfLoosePermissions(file));

    expect(lines.join("")).toContain("rotate");
  });

  it("writes to stderr and never to stdout, so --json stays parseable", () => {
    const file = path.join(root, "config.json");
    fs.writeFileSync(file, "{}");
    fs.chmodSync(file, 0o644);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    captureStderr();

    warnIfLoosePermissions(file);

    expect(stdout).not.toHaveBeenCalled();
  });
});
