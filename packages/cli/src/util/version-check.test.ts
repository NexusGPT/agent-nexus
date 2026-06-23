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
  formatUpdateMessage
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
});

describe("checkForUpdate", () => {
  it("returns a non-alarming update message from a fresh cache", async () => {
    writeCache("0.2.21", Date.now());

    const msg = await checkForUpdate("0.2.19");

    expect(msg).toContain("Update available");
    expect(msg).not.toMatch(FORBIDDEN);
  });
});
