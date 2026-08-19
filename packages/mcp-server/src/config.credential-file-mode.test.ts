import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoosePermissionWarning } from "./secret-file";

/**
 * THIS PACKAGE WRITES THE SAME CREDENTIAL FILE AS `@agent-nexus/cli`.
 *
 * `~/.nexus-mcp/config.json` has two writers, so hardening one of them leaves a
 * second binary putting a plaintext API key back on disk at whatever mode the
 * path already carried. `saveConfig` here has TWO write paths — the V2 branch
 * that merges into an existing profiles document, and the V1 fallback — and both
 * passed `mode: 0o600`, which `open(2)` ignores on a file that already exists.
 *
 * ⚠️ HOME IS SET BEFORE `./config` IS IMPORTED: the module resolves
 * `~/.nexus-mcp/config.json` once, at load.
 */

type ConfigModule = typeof import("./config");

let mod: ConfigModule;
let home: string;
let configDir: string;
let configFile: string;

const MODE = (target: string): number => fs.statSync(target).mode & 0o777;

const realHome = process.env.HOME;
const realUserProfile = process.env.USERPROFILE;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-cred-mode-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  configDir = path.join(home, ".nexus-mcp");
  configFile = path.join(configDir, "config.json");
  mod = await import("./config");
});

afterAll(() => {
  process.env.HOME = realHome;
  process.env.USERPROFILE = realUserProfile;
  fs.rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
  delete process.env.NEXUS_PROFILE;
  resetLoosePermissionWarning();
  vi.restoreAllMocks();
});

const V2 = { activeProfile: "default", profiles: { default: { apiKey: "nxs_placeholder" } } };

describe("saveConfig, V2 branch", () => {
  it("leaves a PRE-EXISTING 0644 config file at 0600", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(V2));
    fs.chmodSync(configFile, 0o644);
    expect(MODE(configFile)).toBe(0o644); // the precondition is real, not assumed

    mod.saveConfig({ apiKey: "nxs_placeholder" });

    expect(MODE(configFile)).toBe(0o600);
  });

  it("leaves a PRE-EXISTING 0755 ~/.nexus-mcp directory at 0700", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(V2));
    fs.chmodSync(configDir, 0o755);
    expect(MODE(configDir)).toBe(0o755); // the precondition is real, not assumed

    mod.saveConfig({ apiKey: "nxs_placeholder" });

    expect(MODE(configDir)).toBe(0o700);
  });
});

describe("saveConfig, V1 fallback branch", () => {
  it("leaves a PRE-EXISTING 0644 flat config file at 0600", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({ apiKey: "nxs_placeholder" }));
    fs.chmodSync(configFile, 0o644);

    mod.saveConfig({ apiKey: "nxs_placeholder" });

    expect(MODE(configFile)).toBe(0o600);
    // The V1 shape is what was written — this really is the second branch.
    expect(JSON.parse(fs.readFileSync(configFile, "utf-8"))).not.toHaveProperty("profiles");
  });

  it("leaves a PRE-EXISTING 0755 directory at 0700 with no config file at all", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.chmodSync(configDir, 0o755);

    mod.saveConfig({ apiKey: "nxs_placeholder" });

    expect(MODE(configDir)).toBe(0o700);
    expect(MODE(configFile)).toBe(0o600);
  });
});

describe("loadConfig", () => {
  it("warns that the key may already be exposed when it reads a 0644 config", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(V2));
    fs.chmodSync(configFile, 0o644);
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });

    expect(mod.loadConfig().apiKey).toBe("nxs_placeholder");
    expect(lines.join("")).toContain("rotate");
  });
});
