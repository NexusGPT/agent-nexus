import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoosePermissionWarning } from "./util/secret-file";

/**
 * `~/.nexus-mcp/config.json` HOLDS A LIVE API KEY IN PLAINTEXT, AND ITS MODE IS
 * A PROPERTY OF EVERY WRITE — NOT OF THE FIRST ONE.
 *
 * `secret-file.test.ts` proves the helper. This file proves the CREDENTIAL FILE
 * actually goes through it: a helper nothing calls is a helper that protects
 * nothing, and `saveConfig` used to pass `mode: 0o600` instead — which `open(2)`
 * honours only when it has to create the file, and ignores entirely when the
 * path is already there.
 *
 * ⚠️ HOME IS SET BEFORE `./config` IS IMPORTED. `config.ts` resolves
 * `~/.nexus-mcp/config.json` ONCE, at module load, so a static import would bind
 * this suite to the real profiles of whoever ran it — and WRITE to them.
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
  home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-cli-cred-mode-"));
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
  // The read-time warning fires once per PROCESS by design, and `saveProfile`
  // reads before it writes — so without this every case after the first would
  // assert on a warning that was already spent.
  resetLoosePermissionWarning();
  vi.restoreAllMocks();
});

const CONFIG = {
  activeProfile: "default",
  profiles: { default: { apiKey: "nxs_not_a_real_key" } }
};

describe("saveConfig", () => {
  it("leaves a PRE-EXISTING 0644 config file at 0600", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, "{}");
    fs.chmodSync(configFile, 0o644);
    expect(MODE(configFile)).toBe(0o644); // the precondition is real, not assumed

    mod.saveConfig(CONFIG);

    expect(MODE(configFile)).toBe(0o600);
    // The write still landed — a chmod that also lost the content would be worse.
    expect(JSON.parse(fs.readFileSync(configFile, "utf-8"))).toEqual(CONFIG);
  });

  it("leaves a PRE-EXISTING 0755 ~/.nexus-mcp directory at 0700", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.chmodSync(configDir, 0o755);
    expect(MODE(configDir)).toBe(0o755); // the precondition is real, not assumed

    mod.saveConfig(CONFIG);

    expect(MODE(configDir)).toBe(0o700);
  });

  it("repairs the mode on the SECOND write as well as the first", () => {
    mod.saveConfig(CONFIG);
    // Something outside the CLI loosens it — an installer, a restored backup, a
    // hand `chmod`. The next login must not leave it there.
    fs.chmodSync(configFile, 0o644);
    fs.chmodSync(configDir, 0o755);

    mod.saveConfig(CONFIG);

    expect(MODE(configFile)).toBe(0o600);
    expect(MODE(configDir)).toBe(0o700);
  });

  it("reaches the same guarantee through saveProfile, the login write path", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(CONFIG));
    fs.chmodSync(configFile, 0o644);

    mod.saveProfile("staging", { apiKey: "nxs_not_a_real_key" });

    expect(MODE(configFile)).toBe(0o600);
  });
});

describe("loadConfig", () => {
  const captureStderr = (): string[] => {
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  };

  it("warns that the key may already be exposed when it reads a 0644 config", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(CONFIG));
    fs.chmodSync(configFile, 0o644);
    const lines = captureStderr();

    const loaded = mod.loadConfig();

    // The read still works — the warning is a warning, never a refusal.
    expect(loaded.profiles.default?.apiKey).toBe("nxs_not_a_real_key");
    expect(lines.join("")).toContain("rotate");
  });

  it("says nothing when it reads a 0600 config", () => {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(configFile, JSON.stringify(CONFIG));
    fs.chmodSync(configFile, 0o600);
    const lines = captureStderr();

    mod.loadConfig();

    expect(lines).toEqual([]);
  });
});
