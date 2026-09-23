import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoosePermissionWarning } from "./util/secret-file";
// Type-only, so it is erased and cannot load the module before HOME moves.
import type { MountSession } from "./workspace-direct-mount/mount-session";

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

/**
 * The direct engine's session file holds an AWS bearer triplet and goes through
 * the same helper. Dynamic import for the same reason `./config` is: the state
 * directory is resolved from HOME at module load.
 */
describe("writeSession", () => {
  type DirectMountModule = typeof import("./workspace-direct-mount/session-paths") &
    typeof import("./workspace-direct-mount/read-session") &
    typeof import("./workspace-direct-mount/write-session");
  let direct: DirectMountModule;

  beforeAll(async () => {
    direct = {
      ...(await import("./workspace-direct-mount/session-paths")),
      ...(await import("./workspace-direct-mount/read-session")),
      ...(await import("./workspace-direct-mount/write-session"))
    };
  });

  const SESSION: MountSession = {
    version: 1,
    mountId: "0123456789abcdef",
    profile: "default",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    workspace: { id: "ws-1", slug: "support-docs", shared: false },
    access: "read-write",
    volumeName: "Support Docs (Acme)",
    credentials: {
      accessKeyId: "ASIA_TEST_KEY_ID",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: "2026-09-07T13:00:00.000Z",
    mintedAt: "2026-09-07T12:00:00.000Z"
  };

  it("leaves a PRE-EXISTING 0644 session.json at 0600, its directory at 0700, and no temp file behind", () => {
    const paths = direct.sessionPathsFor(SESSION.mountId);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.sessionFile, "{}");
    fs.chmodSync(paths.sessionFile, 0o644);
    fs.chmodSync(paths.dir, 0o755);
    // The level between the state dir and the mount's own dir is the one the
    // write has to tighten itself; the secret-file helper reaches only the leaf.
    fs.chmodSync(direct.MOUNT_CREDENTIALS_DIR, 0o755);
    expect(MODE(paths.sessionFile)).toBe(0o644); // the precondition is real, not assumed

    direct.writeSession(SESSION);

    expect(MODE(paths.sessionFile)).toBe(0o600);
    expect(MODE(paths.dir)).toBe(0o700);
    expect(MODE(direct.MOUNT_CREDENTIALS_DIR)).toBe(0o700);
    expect(MODE(configDir)).toBe(0o700);
    // The write is tmp + rename: the live file is the whole document and the
    // temp file is gone, so a reader never sees a half-written session.
    expect(fs.readdirSync(paths.dir)).toEqual(["session.json"]);
    expect(direct.readSession(SESSION.mountId)).toEqual({ ok: true, session: SESSION });
  });

  it("reads a missing file as `missing` and a truncated or unreadable one as `malformed`, never throwing", () => {
    expect(direct.readSession(SESSION.mountId)).toEqual({ ok: false, why: "missing" });
    const paths = direct.sessionPathsFor(SESSION.mountId);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.sessionFile, JSON.stringify(SESSION).slice(0, 80));
    expect(direct.readSession(SESSION.mountId)).toEqual({ ok: false, why: "malformed" });
    // Only ENOENT is "no session recorded": a path the process cannot read is
    // a damaged mount, and telling the user nothing is recorded there is wrong.
    fs.rmSync(paths.sessionFile);
    fs.mkdirSync(paths.sessionFile);
    expect(direct.readSession(SESSION.mountId)).toEqual({ ok: false, why: "malformed" });
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
