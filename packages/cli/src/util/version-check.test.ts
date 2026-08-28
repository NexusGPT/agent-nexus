import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectPackageManager, getGlobalInstallCommand } from "./package-manager";

// A failed install (e.g. EACCES on a root-owned global dir) is simulated by
// making execSync throw. We also assert the installer output is captured, not
// inherited, so npm's multi-line error stack never reaches the terminal.
const execSyncMock = vi.fn();
// `spawn` is mocked alongside `execSync` because the version cache is now
// refreshed by a detached child rather than by an awaited fetch. A factory that
// omitted it would make the import `undefined`, the call would throw, and
// `scheduleCacheRefresh`'s own catch would swallow it — every case below would
// pass while the refresh silently never happened.
const spawnMock = vi.fn((_command: string, _args: string[], _options: Record<string, unknown>) => ({
  unref: () => undefined
}));
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
  spawn: (...args: unknown[]) => spawnMock(...(args as [string, string[], Record<string, unknown>]))
}));

import {
  autoUpdate,
  checkForUpdate,
  compareSemver,
  formatAutoUpdateFailedMessage,
  formatUpdateMessage,
  isAutoUpdateDisabled,
  isInstallPrefixWritable
} from "./version-check";

// The misleading nag this issue (NEX-2422) removes.
const FORBIDDEN = /MUST update|results? .*may be incorrect/i;

const CACHE_REL = path.join(".nexus-mcp", "version-check.json");
let tmpHome: string;
let homedirSpy: ReturnType<typeof vi.spyOn>;

/**
 * 🚨 CLEARED FOR THE WHOLE FILE, NOT PER DESCRIBE. `isAutoUpdateDisabled()` now
 * governs `checkForUpdate` and `autoUpdate` as well as the install, so a runner
 * that exports `CI=1` — every GitHub Actions job — turns each case below into a
 * no-op that returns null. The suite would go red on the machine that matters
 * and stay green on every laptop.
 */
const AUTO_UPDATE_ENV = ["NEXUS_NO_AUTO_UPDATE", "CI"] as const;
let savedEnv: Record<string, string | undefined>;

function writeCache(latestVersion: string, lastChecked: number): void {
  const file = path.join(tmpHome, CACHE_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ lastChecked, latestVersion }));
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "version-check-test-"));
  homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  execSyncMock.mockReset();
  spawnMock.mockClear();
  savedEnv = Object.fromEntries(AUTO_UPDATE_ENV.map((k) => [k, process.env[k]]));
  for (const k of AUTO_UPDATE_ENV) delete process.env[k];
});

afterEach(() => {
  homedirSpy.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  for (const k of AUTO_UPDATE_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("compareSemver", () => {
  it("orders versions correctly", () => {
    expect(compareSemver("0.2.19", "0.2.21")).toBe(-1);
    expect(compareSemver("0.2.21", "0.2.19")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("formatUpdateMessage", () => {
  it("announces the update without the misleading MUST-update nag", () => {
    const msg = formatUpdateMessage("0.2.19", "0.2.21");
    expect(msg).toContain("Update available: 0.2.19 → 0.2.21");
    expect(msg).not.toMatch(FORBIDDEN);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * 🚨 THE GUARD AGAINST A SECOND BUILDER. THE NAG AND `nexus upgrade` NAMED
   *    DIFFERENT COMMANDS FROM THE COMMIT THAT INTRODUCED BOTH (c592c54154).
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The banner printed each manager's `update`/`upgrade` verb while `nexus
   * upgrade` ran `getGlobalInstallCommand` — `…@latest`. Those are not the same
   * command: an `update` verb resolves inside the range a global root already
   * recorded, and a caret on a `0.` major does not admit the next minor. From
   * 0.34.x with `^0.34.0` recorded, and 0.35.1 published, every manager stopped
   * at 0.34.2 and exited 0, so the banner kept printing after the user had done
   * exactly what it asked.
   *
   * `argv[1]` is what `detectPackageManager` reads, so each case below is a real
   * per-manager run rather than an assertion about npm three times.
   */
  describe("names the command `nexus upgrade` itself runs, for every manager", () => {
    const LAYOUTS: ReadonlyArray<readonly [string, string]> = [
      ["npm", "/usr/local/lib/node_modules/@agent-nexus/cli/dist/index.js"],
      ["pnpm", "/Users/x/Library/pnpm/global/v11/node_modules/@agent-nexus/cli/dist/index.js"],
      ["yarn", "/Users/x/.config/yarn/global/node_modules/@agent-nexus/cli/dist/index.js"]
    ];

    let savedArgv1: string;
    beforeEach(() => {
      savedArgv1 = process.argv[1];
    });
    afterEach(() => {
      process.argv[1] = savedArgv1;
    });

    /** The command the banner actually tells the user to run. */
    function quotedCommand(message: string): string {
      const quoted = /Run "([^"]+)" to update\./.exec(message);
      if (quoted === null) throw new Error(`no quoted command in banner: ${message}`);
      return quoted[1];
    }

    for (const [manager, entryPoint] of LAYOUTS) {
      it(`${manager}: the banner's command is exactly getGlobalInstallCommand`, () => {
        process.argv[1] = entryPoint;
        expect(detectPackageManager()).toBe(manager);

        const printed = quotedCommand(formatUpdateMessage("0.34.0", "0.35.1"));

        // THE RED. Before the fix this was `npm update -g …` / `pnpm update -g
        // …` / `yarn global upgrade …` while `nexus upgrade` ran the other one.
        expect(printed).toBe(getGlobalInstallCommand("@agent-nexus/cli"));

        // The tag is the half that crosses a 0.x minor: an `update`/`upgrade`
        // verb resolves inside the recorded range and stops one minor short.
        expect(printed).toContain("@agent-nexus/cli@latest");
        expect(printed).not.toMatch(/\b(?:update|upgrade)\b/);
      });
    }
  });
});

describe("formatAutoUpdateFailedMessage", () => {
  it("is a brief one-line notice without the false 'results may be incorrect' claim", () => {
    const msg = formatAutoUpdateFailedMessage("0.2.21");
    expect(msg).toContain("Auto-update to 0.2.21 failed");
    expect(msg).toContain("to update manually");
    expect(msg).not.toMatch(FORBIDDEN);
    // One line of content (leading + trailing newline only).
    expect(msg.trim().split("\n")).toHaveLength(1);
  });
});

describe("autoUpdate", () => {
  it("returns the brief failure notice when the install fails (EACCES)", async () => {
    writeCache("0.2.21", Date.now());
    execSyncMock.mockImplementation(() => {
      throw new Error("npm error code EACCES ... rename '/usr/local/lib/...'");
    });

    const msg = await autoUpdate("0.2.19");

    expect(msg).toContain("Auto-update to 0.2.21 failed");
    expect(msg).not.toMatch(FORBIDDEN);
  });

  it("captures installer output instead of inheriting it", async () => {
    writeCache("0.2.21", Date.now());
    execSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });

    await autoUpdate("0.2.19");

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const opts = execSyncMock.mock.calls[0][1] as { stdio?: unknown };
    expect(opts.stdio).not.toBe("inherit");
  });

  it("returns a success notice when the install succeeds", async () => {
    writeCache("0.2.21", Date.now());
    execSyncMock.mockImplementation(() => Buffer.from(""));

    const msg = await autoUpdate("0.2.19");

    expect(msg).toContain("Successfully auto-updated to 0.2.21");
  });

  it("returns null when already up-to-date and never shells out", async () => {
    writeCache("0.2.21", Date.now());

    const msg = await autoUpdate("0.2.21");

    expect(msg).toBeNull();
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("bounds the install with a timeout so it can never hang indefinitely", async () => {
    writeCache("0.2.21", Date.now());
    execSyncMock.mockImplementation(() => Buffer.from(""));

    await autoUpdate("0.2.19");

    const opts = execSyncMock.mock.calls[0][1] as { timeout?: number };
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it("backs off after a failed attempt: does not shell out again within the TTL", async () => {
    writeCache("0.2.21", Date.now());
    execSyncMock.mockImplementation(() => {
      throw new Error("npm error code EACCES");
    });

    const first = await autoUpdate("0.2.19");
    expect(first).toContain("Auto-update to 0.2.21 failed");
    expect(execSyncMock).toHaveBeenCalledTimes(1);

    // Every subsequent invocation must skip the blocking install entirely.
    const second = await autoUpdate("0.2.19");
    expect(second).toContain("Auto-update to 0.2.21 failed");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("retries once the backoff TTL has expired", async () => {
    const cacheFile = path.join(tmpHome, CACHE_REL);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        lastChecked: Date.now(),
        latestVersion: "0.2.21",
        failedVersion: "0.2.21",
        failedAt: Date.now() - 25 * 60 * 60 * 1000 // 25h ago — past the 24h TTL
      })
    );
    execSyncMock.mockImplementation(() => Buffer.from(""));

    const msg = await autoUpdate("0.2.19");

    expect(msg).toContain("Successfully auto-updated to 0.2.21");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("retries when a newer version than the failed one is available", async () => {
    const cacheFile = path.join(tmpHome, CACHE_REL);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        lastChecked: Date.now(),
        latestVersion: "0.2.22",
        failedVersion: "0.2.21",
        failedAt: Date.now()
      })
    );
    execSyncMock.mockImplementation(() => Buffer.from(""));

    const msg = await autoUpdate("0.2.19");

    expect(msg).toContain("Successfully auto-updated to 0.2.22");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("skips the install without shelling out when the install prefix is not writable", async () => {
    writeCache("0.2.21", Date.now());

    // Simulate a root-owned global install: argv[1] resolves into a
    // node_modules tree whose dirs fail the W_OK access check.
    const pkgDir = path.join(tmpHome, "node_modules", "@agent-nexus", "cli", "dist");
    fs.mkdirSync(pkgDir, { recursive: true });
    const binPath = path.join(pkgDir, "index.js");
    fs.writeFileSync(binPath, "");
    const origArgv1 = process.argv[1];
    process.argv[1] = binPath;
    const accessSpy = vi.spyOn(fs, "accessSync").mockImplementation(() => {
      throw new Error("EACCES");
    });

    try {
      const msg = await autoUpdate("0.2.19");

      expect(msg).toContain("Auto-update to 0.2.21 failed");
      expect(execSyncMock).not.toHaveBeenCalled();
    } finally {
      accessSpy.mockRestore();
      process.argv[1] = origArgv1;
    }
  });
});

describe("isInstallPrefixWritable", () => {
  it("is permissive when not running from a node_modules layout", () => {
    const origArgv1 = process.argv[1];
    const script = path.join(tmpHome, "src", "index.ts");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "");
    process.argv[1] = script;
    try {
      expect(isInstallPrefixWritable()).toBe(true);
    } finally {
      process.argv[1] = origArgv1;
    }
  });
});

// Both keys are cleared and restored by the file-level hooks above.
describe("isAutoUpdateDisabled", () => {
  it("is enabled by default", () => {
    expect(isAutoUpdateDisabled()).toBe(false);
  });

  it("is disabled via NEXUS_NO_AUTO_UPDATE", () => {
    process.env.NEXUS_NO_AUTO_UPDATE = "1";
    expect(isAutoUpdateDisabled()).toBe(true);
  });

  it("is disabled in CI", () => {
    process.env.CI = "true";
    expect(isAutoUpdateDisabled()).toBe(true);
  });

  it("treats 0/false as not set", () => {
    process.env.NEXUS_NO_AUTO_UPDATE = "0";
    process.env.CI = "false";
    expect(isAutoUpdateDisabled()).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("returns a non-alarming update message from a fresh cache", async () => {
    writeCache("0.2.21", Date.now());

    const msg = await checkForUpdate("0.2.19");

    expect(msg).toContain("Update available");
    expect(msg).not.toMatch(FORBIDDEN);
  });

  it("answers from an EXPIRED cache and writes nothing itself", async () => {
    // The expired cache is still the best answer this invocation has, and the
    // refresh it schedules is for the next one. Returning null here instead
    // would trade a number that is at most a day old for no number at all.
    const cacheFile = path.join(tmpHome, CACHE_REL);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const expired = {
      lastChecked: Date.now() - 25 * 60 * 60 * 1000,
      latestVersion: "0.2.21",
      failedVersion: "0.2.21",
      failedAt: Date.now() - 60_000
    };
    fs.writeFileSync(cacheFile, JSON.stringify(expired));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const msg = await checkForUpdate("0.2.19");

      expect(msg).toContain("Update available: 0.2.19 → 0.2.21");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledTimes(1);
      // Byte-identical: the parent is a reader here. The failure-backoff fields
      // survive because nothing in this process rewrites the file at all — the
      // child merges them back, which `update-check-never-blocks.test.ts`
      // proves against a real process.
      expect(JSON.parse(fs.readFileSync(cacheFile, "utf-8"))).toEqual(expired);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
