import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway HOME, set before mount-registry computes STATE_DIR from it.
const SANDBOX = vi.hoisted(() => {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-install-lock-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { INSTALL_LOCK_DIR, INSTALL_LOCK_TTL_MS, withInstallLock } from "./install-lock";

describe("withInstallLock — one installer at a time", () => {
  beforeEach(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("holds the lock while the work runs and releases it after, on success and on failure", async () => {
    let heldDuring = false;
    await withInstallLock(async () => {
      heldDuring = fs.existsSync(INSTALL_LOCK_DIR);
    });
    expect(heldDuring).toBe(true);
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);

    await expect(
      withInstallLock(async () => {
        throw new Error("the installer failed");
      })
    ).rejects.toThrow("the installer failed");
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
  });

  it("refuses a second run while the first holds the lock, naming the lock's path", async () => {
    await withInstallLock(async () => {
      await expect(withInstallLock(async () => "second")).rejects.toMatchObject({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining("Another nexus mount is installing"),
        hint: expect.stringContaining(INSTALL_LOCK_DIR)
      });
    });
  });

  it("takes over a lock older than the TTL — a crashed run's — and not one younger", async () => {
    fs.mkdirSync(INSTALL_LOCK_DIR, { recursive: true });
    // A marker beside the lock: the listing below must find it, which proves
    // it read the lock's folder — an empty listing is also what a wrong path gives.
    const bin = path.dirname(INSTALL_LOCK_DIR);
    fs.writeFileSync(path.join(bin, "keep.marker"), "");
    const held = fs.statSync(INSTALL_LOCK_DIR).mtimeMs;
    const young = () => held + INSTALL_LOCK_TTL_MS - 1000;
    await expect(withInstallLock(async () => "no", young)).rejects.toThrow(/Another nexus mount/);
    const stale = () => held + INSTALL_LOCK_TTL_MS + 1000;
    await expect(withInstallLock(async () => "taken over", stale)).resolves.toBe("taken over");
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
    // The takeover renames the stale lock away and sweeps it: no lock and no
    // `.install-lock.stale-*` survive — only the marker.
    expect(fs.readdirSync(bin)).toEqual(["keep.marker"]);
  });
});

/** A lock another run holds, the way `withInstallLock` writes one. */
function lockHeldBy(owner: string): void {
  fs.mkdirSync(INSTALL_LOCK_DIR, { recursive: true });
  fs.writeFileSync(path.join(INSTALL_LOCK_DIR, "owner"), owner);
}

describe("withInstallLock — whose lock it is, and what a failure leaves behind", () => {
  beforeEach(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));
  afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

  it("two runs that both read a lock as stale: the second hands back the lock the first just took, and stands down", async () => {
    lockHeldBy("crashed-run");
    const stale = () => fs.statSync(INSTALL_LOCK_DIR).mtimeMs + INSTALL_LOCK_TTL_MS + 1000;
    const now = stale();
    // Run B's whole takeover lands between this run's stat and its rename —
    // the one gap a single process can only stage by hooking the stat.
    const realStat = fs.statSync;
    const statSpy = vi.spyOn(fs, "statSync").mockImplementationOnce(((...args: unknown[]) => {
      const seen = (realStat as (...a: unknown[]) => fs.Stats)(...args);
      fs.rmSync(INSTALL_LOCK_DIR, { recursive: true, force: true });
      lockHeldBy("run-b");
      return seen;
    }) as typeof fs.statSync);
    try {
      await expect(
        withInstallLock(
          async () => "stole it",
          () => now
        )
      ).rejects.toThrow(/Another nexus mount/);
    } finally {
      statSpy.mockRestore();
    }
    expect(fs.readFileSync(path.join(INSTALL_LOCK_DIR, "owner"), "utf-8")).toBe("run-b");
  });

  it("releases only its own lock: a run whose lock was taken over leaves its successor's alone", async () => {
    await withInstallLock(async () => {
      fs.rmSync(INSTALL_LOCK_DIR, { recursive: true, force: true });
      lockHeldBy("successor");
    });
    expect(fs.readFileSync(path.join(INSTALL_LOCK_DIR, "owner"), "utf-8")).toBe("successor");
  });

  it("an unwritable directory is not a held lock: it says so, and names no lock to remove", async () => {
    // Staged at the mkdir itself: `ensureStateSubdir` re-chmods the directory
    // to 0700 first, so a chmod here would be undone before the lock is tried.
    const realMkdir = fs.mkdirSync;
    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockImplementation(((...args: unknown[]) => {
      if (args[0] === INSTALL_LOCK_DIR) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }
      return (realMkdir as (...a: unknown[]) => unknown)(...args);
    }) as typeof fs.mkdirSync);
    try {
      await expect(withInstallLock(async () => "no")).rejects.toMatchObject({
        code: "CLI_LOCAL_FAILED",
        message: expect.stringContaining("could not be created (EACCES)")
      });
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  it("a disk too full to write the owner leaves no lock behind to refuse the next half hour", async () => {
    const realWrite = fs.writeFileSync;
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(((
      file: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(file).endsWith(path.join(".install-lock", "owner"))) {
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      }
      return (realWrite as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.writeFileSync);
    try {
      await expect(withInstallLock(async () => "no")).rejects.toThrow(/ENOSPC/);
    } finally {
      writeSpy.mockRestore();
    }
    expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
  });

  it("Ctrl-C releases the lock, then raises the signal again so the process still ends", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const before = process.listeners("SIGINT").length;
    try {
      await withInstallLock(async () => {
        const listening = process.listeners("SIGINT");
        const ours = listening[listening.length - 1];
        expect(process.listeners("SIGINT").length).toBe(before + 1);
        ours?.("SIGINT");
        expect(fs.existsSync(INSTALL_LOCK_DIR)).toBe(false);
      });
      expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");
      expect(process.listeners("SIGINT").length).toBe(before);
    } finally {
      kill.mockRestore();
    }
  });
});
