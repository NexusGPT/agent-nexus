import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A failed install (e.g. EACCES on a root-owned global dir) is simulated by
// making execSync throw. We also assert the installer output is captured, not
// inherited, so npm's multi-line error stack never reaches the terminal.
const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args)
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

function writeCache(latestVersion: string, lastChecked: number): void {
  const file = path.join(tmpHome, CACHE_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ lastChecked, latestVersion }));
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "version-check-test-"));
  homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  execSyncMock.mockReset();
});

afterEach(() => {
  homedirSpy.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
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

describe("isAutoUpdateDisabled", () => {
  const ENV_KEYS = ["NEXUS_NO_AUTO_UPDATE", "CI"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

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

  it("preserves failure-backoff fields when refreshing an expired lookup cache", async () => {
    const cacheFile = path.join(tmpHome, CACHE_REL);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const failedAt = Date.now() - 60_000;
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        lastChecked: Date.now() - 25 * 60 * 60 * 1000, // expired — forces a refresh
        latestVersion: "0.2.21",
        failedVersion: "0.2.21",
        failedAt
      })
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ version: "0.2.21" })));

    try {
      await checkForUpdate("0.2.19");

      const saved = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      expect(saved.failedVersion).toBe("0.2.21");
      expect(saved.failedAt).toBe(failedAt);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
