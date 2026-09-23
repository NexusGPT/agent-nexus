import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError,
  type WorkspaceMountCredentials
} from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The state directory is resolved from HOME when `../mount-registry` loads,
 * so the sandbox is set BEFORE any import — `vi.hoisted` runs ahead of them
 * wherever it sits in the file. The direct-engine cases below write real
 * session files under it; nothing here may reach the developer's own
 * `~/.nexus-mcp`.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-workspace-status-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { clearConfig, saveProfile } from "../config";
import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { awsConfigFor } from "../workspace-direct-mount/aws-config";
import type { MountSession } from "../workspace-direct-mount/mount-session";
import { EXPIRATION_LEAD_MS } from "../workspace-direct-mount/process-credentials-document";
import { readSession } from "../workspace-direct-mount/read-session";
import {
  REFRESH_BUDGET_MS,
  REFRESH_RETRY_DELAY_MS
} from "../workspace-direct-mount/refresh-retry-budget";
import { sessionPathsFor } from "../workspace-direct-mount/session-paths";
import { writeSession } from "../workspace-direct-mount/write-session";

/**
 * NEX-2372: `workspace status` + the mounts registry must expose the mount MODE
 * (ro/rw) and the ORG/profile pinned at mount time — both were unobservable
 * before (ro discovered only by a failed write; the registry was org-blind).
 * NEX-2360: the registry is org-scoped, so two orgs' mounts of the SAME slug
 * coexist and each row shows which org it serves.
 */

// The mount table / liveness probes shell out; stub them so status is
// deterministic and never touches the real OS mount table. `spawn` is the
// same stub the credential-process helper posts its desktop notification
// through, so a case can read what it would have said.
vi.mock("node:child_process", () => ({
  // `ps` reports every recorded pid as an rclone mount, so a row carrying this
  // process's pid reads live; everything else answers nothing.
  execFileSync: vi.fn((command: string) =>
    command === "ps" ? "rclone mount nxws: /home/u/nexus/general-context\n" : ""
  ),
  execSync: vi.fn(() => ""),
  spawn: vi.fn()
}));

// The helper's ONE backend call, and the options it built its client from.
const mint = vi.fn<(slug: string, body: unknown) => Promise<WorkspaceMountCredentials>>();
const clientOpts: Array<Record<string, unknown>> = [];
vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: (opts: Record<string, unknown>) => {
      clientOpts.push(opts);
      return { workspaces: { mintMountCredentials: mint } };
    }
  };
});

// Drive `readMounts()` off an in-memory registry instead of ~/.nexus-mcp.
let registry: Record<string, unknown> = {};
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn((p: string, ...rest: unknown[]) => {
        if (String(p).endsWith("workspace-mounts.json")) return JSON.stringify(registry);
        return (actual.readFileSync as unknown as (...a: unknown[]) => unknown)(p, ...rest);
      })
    }
  };
});

import { registerWorkspaceCommands } from "./workspace";

const MOUNT_ID = "0123456789abcdef";

async function runStatus(): Promise<unknown> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(true);
  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", "status"]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }
  return JSON.parse(chunks.join("\n"));
}

// 🚨 EVERY FIXTURE MOUNT CARRIES THIS PROCESS'S OWN pid, SO IT READS LIVE.
//
// They were 999999999 — deliberately dead, to keep the fixture off the OS — and
// that stopped working when `workspace status` began REFUSING on a dead mount:
// under --json the error document replaces the rows, so a fixture about the
// mode / org / profile COLUMNS never got to print one. `isMountLive` is
// `process.kill(pid, 0)` for the rclone engine, which on our own pid is a
// syscall rather than a shell-out, and is deterministic.
//
// Liveness itself is covered by `workspace-status-verdict-exits.test.ts`, which
// drives both directions; nothing in THIS file is about it.
describe("nexus workspace status (NEX-2360/NEX-2372 columns)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry = {};
  });
  afterEach(() => setJsonMode(false));

  it("surfaces mode + org + profile for a read-only mount", async () => {
    registry = {
      "org:org_abc|general-context": {
        slug: "general-context",
        engine: "rclone",
        mountPath: "/home/u/nexus/general-context",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: true,
        profile: "orange",
        orgName: "Acme",
        orgId: "org_abc",
        pid: process.pid,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "general-context",
      mode: "ro",
      orgId: "org_abc",
      orgName: "Acme",
      profile: "orange"
    });
  });

  it("reports rw for a read-write mount", async () => {
    registry = {
      "profile:blue|tools": {
        slug: "tools",
        engine: "rclone",
        mountPath: "/home/u/nexus/tools",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        profile: "blue",
        pid: process.pid,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ mode: "rw", profile: "blue", orgId: null });
  });

  it("reports ro for a direct row that asked for read-write and was GRANTED read — the grant is the mode", async () => {
    // Nothing else about this row is under test, so it is deliberately a
    // non-direct-looking row apart from `access`: no session file is read for
    // the mode column.
    registry = {
      "org:org_abc|docs": {
        slug: "docs",
        engine: "rclone",
        mountPath: "/home/u/nexus/docs",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        access: "read",
        profile: "orange",
        orgId: "org_abc",
        pid: process.pid,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ slug: "docs", mode: "ro" });
  });

  it("reports mode UNKNOWN, never rw, for a grade this CLI does not recognise", async () => {
    // `access` comes out of the same parsed-and-cast registry file as every
    // other field, so a garbled value is reachable. `"READ"` must not fall
    // through the `=== "read"` comparison and print `rw` over a drive the
    // server graded read — the one claim this column exists never to make.
    registry = {
      "org:org_abc|docs": {
        slug: "docs",
        engine: "rclone",
        mountPath: "/home/u/nexus/docs",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        access: "READ",
        profile: "orange",
        orgId: "org_abc",
        pid: process.pid,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ slug: "docs", mode: null });
  });

  it("shows both orgs' mounts when the same slug is mounted for two orgs", async () => {
    const base = {
      slug: "general-context",
      engine: "rclone",
      baseUrl: "https://api.nexusgpt.io",
      readOnly: false,
      pid: process.pid,
      mountedAt: "2026-06-24T00:00:00.000Z"
    };
    registry = {
      "org:org_aaa|general-context": {
        ...base,
        mountPath: "/home/u/nexus/acme/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      },
      "org:org_bbb|general-context": {
        ...base,
        mountPath: "/home/u/nexus/globex/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.orgName).sort()).toEqual(["Acme", "Globex"]);
    expect(new Set(rows.map((r) => r.slug))).toEqual(new Set(["general-context"]));
  });

  it("shows unknowns for legacy records that predate the mode/org/profile fields", async () => {
    registry = {
      legacy: {
        slug: "legacy",
        engine: "rclone",
        mountPath: "/home/u/nexus/legacy",
        baseUrl: "https://api.nexusgpt.io",
        pid: process.pid,
        mountedAt: "2026-06-24T00:00:00.000Z"
      }
    };
    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      mode: null,
      orgId: null,
      orgName: null,
      profile: null,
      mountId: null
    });
  });

  it("reports a direct mount's mountId under --json — the operand credential-process takes", async () => {
    registry = { "org:org_pinned|support-docs": directRow() };
    healthyDirectMount();

    const rows = (await runStatus()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ engine: "direct", mountId: MOUNT_ID });
    // The row's storage-free shape is the leak guard: nothing bucket-shaped
    // reaches stdout through this projection.
    expect(JSON.stringify(rows)).not.toMatch(/bucket|prefix|nxw-|credential/i);
  });
});

// ── workspace status: a direct row's renewal, from local reads ───────────────
//
// Expires, Refresh and Pending come from three LOCAL reads — the session file,
// the two paths the aws.config line names, the profile in config.json — and
// the exit code carries the verdict the way it carries `live`. Every case
// below writes real files under the sandbox HOME and drives the real command.

/** A live direct row: `isMountLive` is `process.kill(pid, 0)` on this pid. */
function directRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "support-docs",
    engine: "direct",
    mountPath: "/home/u/nexus/acme/support-docs",
    baseUrl: "https://api.nexusgpt.io",
    readOnly: false,
    profile: "work",
    orgId: "org_pinned",
    orgName: "Acme",
    pid: process.pid,
    mountedAt: "2026-09-07T12:00:00.000Z",
    mountId: MOUNT_ID,
    access: "read-write",
    ...over
  };
}

/** The profile the session pins, the session itself, and a usable aws.config. */
function healthyDirectMount(session: MountSession = sessionFixture()): void {
  saveProfile("work", { apiKey: "nxs_work", baseUrl: "https://api.nexusgpt.io" });
  writeSession(session);
  const config = awsConfigFor({
    execPath: process.execPath,
    entry: fileURLToPath(import.meta.url),
    mountId: MOUNT_ID
  });
  if (!config.ok) throw new Error("fixture must be writable");
  fs.writeFileSync(sessionPathsFor(MOUNT_ID).awsConfigFile, config.text);
}

/** Two saves the last mount never uploaded, as rclone's cache records them. */
function leaveDirtyItems(count: number): void {
  const metaRoot = path.join(
    sessionPathsFor(MOUNT_ID).cacheDir,
    "vfsMeta",
    "nxws{abc}",
    "support-docs"
  );
  fs.mkdirSync(metaRoot, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    fs.writeFileSync(
      path.join(metaRoot, `draft-${String(index)}.md`),
      JSON.stringify({ Dirty: true })
    );
  }
  fs.writeFileSync(path.join(metaRoot, "clean.md"), JSON.stringify({ Dirty: false }));
}

interface StatusRun {
  readonly stdout: string;
  readonly exitCode: number;
}

async function runStatusDetailed(json: boolean): Promise<StatusRun> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(json);
  process.exitCode = 0;
  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), "workspace", "status"]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }
  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = 0;
  return { stdout: chunks.join("\n"), exitCode };
}

type StatusErrorDocument = { error: { message: string; hint: string; code: string } };

describe("nexus workspace status — a direct row's Expires / Refresh / Pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
    fs.rmSync(sessionPathsFor(MOUNT_ID).cacheDir, { recursive: true, force: true });
    clearConfig();
    registry = { "org:org_pinned|support-docs": directRow() };
  });
  afterEach(() => setJsonMode(false));

  it("prints expiresAt, an ok refresh and zero pending uploads for a healthy row, exit 0", async () => {
    const session = sessionFixture();
    healthyDirectMount(session);

    const run = await runStatusDetailed(true);

    expect(run.exitCode).toBe(0);
    const rows = JSON.parse(run.stdout) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      live: "yes",
      expiresAt: session.expiresAt,
      refresh: { outcome: "ok", at: session.mintedAt, reason: null, transient: false, fix: null },
      pendingUploads: 0
    });
    expect(JSON.stringify(rows)).not.toMatch(/bucket|prefix|nxw-|credential|not-a-secret/i);
  });

  it("renders the three columns in the table only when a direct row is present", async () => {
    healthyDirectMount();
    const withDirect = await runStatusDetailed(false);
    expect(withDirect.stdout).toContain("Expires");
    expect(withDirect.stdout).toContain("Refresh");
    expect(withDirect.stdout).toContain("Pending");
    expect(withDirect.stdout).toMatch(/ok (just now|\d+[smhd] ago)/);
    expect(withDirect.stdout).toMatch(/in \d+[smhd]/);

    registry = {
      "org:org_pinned|tools": {
        slug: "tools",
        engine: "rclone",
        mountPath: "/home/u/nexus/tools",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        profile: "work",
        orgId: "org_pinned",
        pid: process.pid,
        mountedAt: "2026-09-07T12:00:00.000Z"
      }
    };
    const withoutDirect = await runStatusDetailed(false);
    expect(withoutDirect.stdout).not.toContain("Refresh");
  });

  it("exits local-failed with the fix when the session is missing — the drive cannot renew", async () => {
    saveProfile("work", { apiKey: "nxs_work", baseUrl: "https://api.nexusgpt.io" });

    const run = await runStatusDetailed(true);

    expect(run.exitCode).toBe(EXIT_CODES["local-failed"]);
    const doc = JSON.parse(run.stdout) as StatusErrorDocument;
    expect(doc.error.code).toBe("CLI_LOCAL_FAILED");
    expect(doc.error.message).toContain("1 direct mount(s) cannot renew their access");
    expect(doc.error.message).toContain("/home/u/nexus/acme/support-docs");
    expect(doc.error.message).toContain("session.json missing");
    expect(doc.error.message).toContain("run: nexus workspace remount support-docs");
    // The live row is NOT listed as dead: the mount is up, its renewal is not.
    expect(doc.error.message).not.toContain("NOT live");
  });

  it("names a row that is dead AND broken once, as dead — its remount rewrites what the renewal path needs", async () => {
    // No session file, no pid: the row is unhealthy twice over, and a reader
    // gets ONE line for it, the one whose fix covers both.
    registry = { "org:org_pinned|support-docs": directRow({ pid: undefined }) };

    const run = await runStatusDetailed(true);

    expect(run.exitCode).toBe(EXIT_CODES["local-failed"]);
    const doc = JSON.parse(run.stdout) as StatusErrorDocument;
    expect(doc.error.message).toContain("1 recorded mount(s) are NOT live");
    expect(doc.error.message).not.toContain("cannot renew");
  });

  it("exits non-zero when the pinned profile is gone from config.json, naming the sign-in", async () => {
    healthyDirectMount();
    clearConfig();

    const run = await runStatusDetailed(true);

    expect(run.exitCode).toBe(EXIT_CODES["local-failed"]);
    const doc = JSON.parse(run.stdout) as StatusErrorDocument;
    expect(doc.error.message).toContain('profile "work" missing from config.json');
    expect(doc.error.message).toContain("nexus auth login --profile work");
  });

  it("marks ONE corrupt row broken and still prints the healthy ones", async () => {
    // `readMounts` parses and casts, so `mountId` is a claim about a JSON file.
    // `sessionPathsFor` THROWS on a malformed one — deliberately, two of its
    // paths reach a recursive delete — and that throw escapes the row's `.map()`
    // and kills the whole command. One bad row then hid every good drive behind
    // a generic error whose own remedy names `workspace status`, the command it
    // had just killed.
    healthyDirectMount();
    registry = {
      ...registry,
      "org:org_pinned|corrupt": { ...directRow(), slug: "corrupt", mountId: "not-hex" }
    };

    const run = await runStatusDetailed(false);

    // The healthy row is still there — that is the whole point.
    expect(run.stdout).toContain("support-docs");
    expect(run.stdout).toContain("corrupt");
    expect(run.stdout).not.toContain("Refusing to use");
  });

  it("does NOT accuse the profile when config.json is there and UNREADABLE", async () => {
    // The verdict this replaces prints `nexus auth login`, and that command
    // SAVES a fresh config over the file — so a truncated config would have the
    // diagnosis destroy the profiles it merely failed to read. A damaged file is
    // not evidence of an absent profile, so the drive stays healthy and exits 0.
    healthyDirectMount();
    fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX, ".nexus-mcp", "config.json"), '{"profiles": {"wo');

    const run = await runStatusDetailed(true);

    expect(run.stdout).not.toContain("missing from config.json");
    expect(run.exitCode).toBe(0);
  });

  it("exits non-zero on a NON-transient failed renewal, and 0 on a transient one", async () => {
    healthyDirectMount(
      sessionFixture({
        lastRefresh: { at: isoIn(-120_000), outcome: "failed", reason: "not-authenticated" }
      })
    );
    const refused = await runStatusDetailed(true);
    expect(refused.exitCode).toBe(EXIT_CODES["local-failed"]);
    const doc = JSON.parse(refused.stdout) as StatusErrorDocument;
    expect(doc.error.message).toContain("Access expired");
    expect(doc.error.message).toContain("nexus auth login --profile work");

    fs.rmSync(sessionPathsFor(MOUNT_ID).sessionFile);
    writeSession(
      sessionFixture({
        lastRefresh: { at: isoIn(-60_000), outcome: "failed", reason: "connection-failed" }
      })
    );
    const offline = await runStatusDetailed(true);
    expect(offline.exitCode).toBe(0);
    const rows = JSON.parse(offline.stdout) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      refresh: { outcome: "failed", reason: "connection-failed", transient: true }
    });
    expect(String((rows[0].refresh as { fix: string }).fix)).toContain(
      "retries on your next click"
    );
  });

  it("reports an expired session with no failure as stale, at exit 0", async () => {
    healthyDirectMount(sessionFixture({ expiresAt: isoIn(-180_000) }));

    const run = await runStatusDetailed(true);

    expect(run.exitCode).toBe(0);
    const rows = JSON.parse(run.stdout) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ refresh: { outcome: "stale" } });
    const table = await runStatusDetailed(false);
    expect(table.stdout).toContain("refreshes on next access");
  });

  it("counts the pending uploads from the cache's vfsMeta, for a live row and a dead one alike", async () => {
    healthyDirectMount();
    leaveDirtyItems(2);

    const live = await runStatusDetailed(true);
    expect(live.exitCode).toBe(0);
    expect((JSON.parse(live.stdout) as Array<Record<string, unknown>>)[0]).toMatchObject({
      pendingUploads: 2
    });

    // Dead (no pid): the refusal replaces the rows under --json; the table
    // still prints the row, Live no and Pending 2, before the refusal.
    registry = { "org:org_pinned|support-docs": directRow({ pid: undefined }) };
    const dead = await runStatusDetailed(false);
    expect(dead.exitCode).toBe(EXIT_CODES["local-failed"]);
    expect(dead.stdout).toMatch(/^support-docs\b.*\bno\b.*\s2\s*$/m);
  });

  it("leaves other engines' rows with null in the three fields", async () => {
    registry = {
      "org:org_pinned|tools": {
        slug: "tools",
        engine: "rclone",
        mountPath: "/home/u/nexus/tools",
        baseUrl: "https://api.nexusgpt.io",
        pid: process.pid,
        mountedAt: "2026-09-07T12:00:00.000Z"
      }
    };
    const run = await runStatusDetailed(true);
    expect((JSON.parse(run.stdout) as Array<Record<string, unknown>>)[0]).toMatchObject({
      expiresAt: null,
      refresh: null,
      pendingUploads: null
    });
  });
});

// ── workspace credential-process: the direct engine's refresh hook ────────────
//
// Driven through the real command over a real session file in the sandbox
// HOME, with the backend replaced by `mint`. What each case pins is the
// contract rclone's AWS SDK relies on: stdout is one process-credentials
// document or NOTHING, a renewal acts on the pinned profile and organization,
// and a renewal that must not be served is refused and recorded.

function isoIn(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function sessionFixture(over: Partial<MountSession> = {}): MountSession {
  return {
    version: 1,
    mountId: MOUNT_ID,
    profile: "work",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_pinned",
    workspace: { id: "ws-1", slug: "support-docs", shared: false },
    access: "read-write",
    volumeName: "Support Docs",
    credentials: {
      accessKeyId: "ASIA_STORED_KEY",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: isoIn(50 * 60 * 1000),
    mintedAt: isoIn(-10 * 60 * 1000),
    ...over
  };
}

/** A session inside the five-minute lead: the helper must renew, not serve. */
function staleFixture(over: Partial<MountSession> = {}): MountSession {
  return sessionFixture({ expiresAt: isoIn(EXPIRATION_LEAD_MS - 60 * 1000), ...over });
}

function mintedFixture(over: Partial<WorkspaceMountCredentials> = {}): WorkspaceMountCredentials {
  return {
    workspace: {
      id: "ws-1",
      slug: "support-docs",
      name: "Support Docs",
      kind: "DRIVE",
      isShared: false
    },
    organization: { id: "org_aaa", name: "Acme" },
    access: "read-write",
    storage: { bucket: "nxw-d-0123456789ab", prefix: "support-docs/", region: "eu-west-3" },
    credentials: {
      accessKeyId: "ASIA_RENEWED_KEY",
      secretAccessKey: "renewed-secret",
      sessionToken: "renewed-token"
    },
    expiresAt: isoIn(60 * 60 * 1000),
    ...over
  };
}

interface Driven {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly exitCode: number;
}

async function runCredentialProcess(args: string[]): Promise<Driven> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  // One `nexus` process is one run, and `emitDocument`'s first-document-wins
  // guard is reset only at the run boundary `setJsonMode` marks. Without this
  // every document after the first in this worker would be diverted to stderr.
  setJsonMode(false);
  process.exitCode = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    stdout.push(parts.map((part) => String(part)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    stderr.push(parts.map((part) => String(part)).join(" "));
  });
  try {
    await program.parseAsync(["node", "nexus", "workspace", "credential-process", ...args]);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = 0;
  return { stdout, stderr, exitCode };
}

function storedSession(): MountSession {
  const read = readSession(MOUNT_ID);
  if (!read.ok) throw new Error(`session file ${read.why}`);
  return read.session;
}

const onDarwin = it.runIf(process.platform === "darwin");

describe("nexus workspace credential-process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Implementations too, not only calls: a persistent `mockRejectedValue`
    // from one case must not decide the next case's first attempt.
    mint.mockReset();
    clientOpts.length = 0;
    delete process.env.NEXUS_ORGANIZATION_ID;
    fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
    registry = {
      "org:org_pinned|support-docs": {
        slug: "support-docs",
        engine: "direct",
        mountPath: "/home/u/nexus/support-docs",
        baseUrl: "https://api.nexusgpt.io",
        readOnly: false,
        profile: "work",
        orgId: "org_pinned",
        orgName: "Acme",
        pid: process.pid,
        mountedAt: "2026-09-07T12:00:00.000Z",
        mountId: MOUNT_ID,
        access: "read-write"
      }
    };
  });
  afterAll(() => {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  });

  it("serves the stored triplet, Expiration five minutes early, without asking Nexus", async () => {
    const session = sessionFixture();
    writeSession(session);

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toHaveLength(1);
    expect(JSON.parse(run.stdout[0])).toEqual({
      Version: 1,
      AccessKeyId: "ASIA_STORED_KEY",
      SecretAccessKey: "not-a-secret",
      SessionToken: "not-a-token",
      Expiration: new Date(new Date(session.expiresAt).getTime() - EXPIRATION_LEAD_MS).toISOString()
    });
    expect(mint).not.toHaveBeenCalled();
    expect(clientOpts).toEqual([]);
  });

  it("renews a stale session through the PINNED profile and org, ignoring the shell's selector", async () => {
    writeSession(staleFixture());
    process.env.NEXUS_ORGANIZATION_ID = "org_from_shell";
    mint.mockResolvedValueOnce(mintedFixture());

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout[0])).toMatchObject({
      Version: 1,
      AccessKeyId: "ASIA_RENEWED_KEY"
    });
    expect(clientOpts).toHaveLength(1);
    expect(clientOpts[0]).toMatchObject({
      profile: "work",
      baseUrl: "https://api.nexusgpt.io",
      organizationId: "org_pinned",
      maxRetries: 0
    });
    // An org-owned mount asks by bare slug at the recorded ceiling, so a
    // replaced workspace surfaces as a different id rather than as a 404.
    expect(mint).toHaveBeenCalledWith("support-docs", { access: "read-write" });
    const stored = storedSession();
    expect(stored.credentials.accessKeyId).toBe("ASIA_RENEWED_KEY");
    expect(stored.lastRefresh).toMatchObject({ outcome: "ok" });
    expect(stored.orgId).toBe("org_pinned");
  });

  it("asks for the shared copy by id when the mount is a shared one", async () => {
    writeSession(
      staleFixture({ workspace: { id: "ws-shared", slug: "support-docs", shared: true } })
    );
    mint.mockResolvedValueOnce(
      mintedFixture({
        workspace: {
          id: "ws-shared",
          slug: "support-docs",
          name: "Support Docs",
          kind: "DRIVE",
          isShared: true
        }
      })
    );

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.exitCode).toBe(0);
    expect(mint).toHaveBeenCalledWith("support-docs", {
      workspaceId: "ws-shared",
      access: "read-write"
    });
  });

  it("refuses a renewal whose workspace id differs, records it, leaves stdout EMPTY and notifies once", async () => {
    writeSession(staleFixture());
    mint.mockResolvedValue(
      mintedFixture({
        workspace: {
          id: "ws-2",
          slug: "support-docs",
          name: "Support Docs",
          kind: "DRIVE",
          isShared: false
        }
      })
    );

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.stdout).toEqual([]);
    expect(run.exitCode).toBe(9);
    expect(run.stderr.join("\n")).toContain("nexus workspace unmount support-docs");
    const stored = storedSession();
    expect(stored.lastRefresh).toMatchObject({ outcome: "failed", reason: "workspace-replaced" });
    // The stored triplet is untouched: nothing from the stranger's mint was kept.
    expect(stored.credentials.accessKeyId).toBe("ASIA_STORED_KEY");
    if (process.platform === "darwin") {
      expect(stored.lastNotified).toEqual({ failed: stored.lastRefresh?.at });
    }
  });

  onDarwin(
    "posts the desktop notification on ok→failed only, then again on failed→ok",
    async () => {
      writeSession(staleFixture());
      mint.mockResolvedValueOnce(mintedFixture({ access: "read" }));

      await runCredentialProcess([MOUNT_ID]);

      const spawned = vi.mocked(spawn).mock.calls;
      expect(spawned).toHaveLength(1);
      expect(spawned[0][0]).toBe("osascript");
      const script = String(spawned[0][1]?.[1]);
      expect(script).toContain('with title "Nexus drive \\"Support Docs\\""');
      expect(script).toContain("nexus workspace remount support-docs");
      expect(script).not.toMatch(/bucket|nxw-|credential|0123456789abcdef/);

      // A second failure inside the debounce window is NOT a transition.
      fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
      writeSession(
        staleFixture({
          lastRefresh: { at: isoIn(-60_000), outcome: "failed", reason: "access-downgraded" }
        })
      );
      mint.mockResolvedValueOnce(mintedFixture({ access: "read" }));
      await runCredentialProcess([MOUNT_ID]);
      expect(vi.mocked(spawn).mock.calls).toHaveLength(1);

      // Recovery is the other transition — once the cooldown from the last
      // failure has passed, so the helper asks Nexus at all.
      fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
      const failedAnnouncedAt = isoIn(-60_000);
      writeSession(
        staleFixture({
          lastRefresh: { at: isoIn(-40_000), outcome: "failed", reason: "access-downgraded" },
          lastNotified: { failed: failedAnnouncedAt }
        })
      );
      mint.mockResolvedValueOnce(mintedFixture());
      await runCredentialProcess([MOUNT_ID]);
      expect(vi.mocked(spawn).mock.calls).toHaveLength(2);
      expect(String(vi.mocked(spawn).mock.calls[1][1]?.[1])).toContain("Access restored");
      // The failed announcement SURVIVES the recovery: that record is what lets
      // the next ok→failed inside the window stay quiet.
      expect(storedSession().lastNotified).toEqual({
        failed: failedAnnouncedAt,
        ok: storedSession().lastRefresh?.at
      });

      // The flap: failed again, two minutes after the failure was announced.
      // Under a single last-announcement record this posted a third
      // notification; the per-outcome record keeps it inside the window.
      fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
      writeSession(
        staleFixture({
          lastRefresh: { at: isoIn(-40_000), outcome: "ok" },
          lastNotified: { failed: isoIn(-120_000), ok: isoIn(-40_000) }
        })
      );
      mint.mockResolvedValueOnce(mintedFixture({ access: "read" }));
      await runCredentialProcess([MOUNT_ID]);
      expect(vi.mocked(spawn).mock.calls).toHaveLength(2);
      expect(storedSession().lastRefresh).toMatchObject({ outcome: "failed" });
    }
  );

  it("refuses a renewal graded lower than the mount was made with", async () => {
    writeSession(staleFixture());
    mint.mockResolvedValueOnce(mintedFixture({ access: "read" }));

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.stdout).toEqual([]);
    expect(run.exitCode).toBe(9);
    expect(run.stderr.join("\n")).toContain("nexus workspace remount support-docs");
    expect(storedSession().lastRefresh).toMatchObject({
      outcome: "failed",
      reason: "access-downgraded"
    });
  });

  it("still serves a renewal the session directory refused to record, and says so on stderr", async () => {
    writeSession(staleFixture());
    mint.mockResolvedValueOnce(mintedFixture());
    // A directory where the temp file would go: the write fails with EISDIR
    // before the rename, so the stored session is the OLD one.
    const paths = sessionPathsFor(MOUNT_ID);
    fs.mkdirSync(`${paths.sessionFile}.${process.pid}.tmp`);
    const warnings: string[] = [];
    const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      warnings.push(String(chunk));
      return true;
    });

    let run: Driven;
    try {
      run = await runCredentialProcess([MOUNT_ID]);
    } finally {
      write.mockRestore();
    }

    // The lease was minted and is valid for an hour: the SDK gets it, exit 0.
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toHaveLength(1);
    expect(JSON.parse(run.stdout[0])).toMatchObject({ AccessKeyId: "ASIA_RENEWED_KEY" });
    expect(warnings.join("")).toContain("Could not record this renewal");
    expect(warnings.join("")).toContain("nexus workspace remount support-docs");
    expect(storedSession().credentials.accessKeyId).toBe("ASIA_STORED_KEY");
    expect(storedSession().lastRefresh).toBeUndefined();
  });

  it("serves a read mount a read renewal — a downgrade is relative to the recorded grade", async () => {
    writeSession(staleFixture({ access: "read" }));
    mint.mockResolvedValueOnce(mintedFixture({ access: "read" }));

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(run.exitCode).toBe(0);
    expect(mint).toHaveBeenCalledWith("support-docs", { access: "read" });
  });

  it("refuses for 30 s after a failure WITHOUT calling Nexus, then asks again", async () => {
    const failedAt = isoIn(-5_000);
    writeSession(
      staleFixture({
        lastRefresh: { at: failedAt, outcome: "failed", reason: "not-authenticated" }
      })
    );

    const cooling = await runCredentialProcess([MOUNT_ID]);

    expect(mint).not.toHaveBeenCalled();
    expect(cooling.stdout).toEqual([]);
    expect(cooling.exitCode).toBe(2);
    expect(cooling.stderr.join("\n")).toContain("nexus auth login --profile work");
    // The refusal did not re-stamp the failure, so the window cannot be
    // extended by polling.
    expect(storedSession().lastRefresh).toEqual({
      at: failedAt,
      outcome: "failed",
      reason: "not-authenticated"
    });

    fs.rmSync(sessionPathsFor(MOUNT_ID).dir, { recursive: true, force: true });
    writeSession(
      staleFixture({
        lastRefresh: { at: isoIn(-40_000), outcome: "failed", reason: "not-authenticated" }
      })
    );
    mint.mockResolvedValueOnce(mintedFixture());

    const renewed = await runCredentialProcess([MOUNT_ID]);

    expect(mint).toHaveBeenCalledTimes(1);
    expect(renewed.exitCode).toBe(0);
  });

  it("does not retry a 401: one attempt, the sign-in hint, exit not-authenticated", async () => {
    writeSession(staleFixture());
    mint.mockRejectedValue(new NexusAuthenticationError("expired", "API_KEY_EXPIRED"));

    const run = await runCredentialProcess([MOUNT_ID]);

    expect(mint).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toEqual([]);
    expect(run.stderr.join("\n")).toContain("nexus auth login --profile work");
    expect(storedSession().lastRefresh).toMatchObject({
      outcome: "failed",
      reason: "not-authenticated"
    });
  });

  it("retries a network failure three times, two seconds apart, and serves the renewal", async () => {
    writeSession(staleFixture());
    mint
      .mockRejectedValueOnce(new NexusConnectionError("offline"))
      .mockRejectedValueOnce(new NexusConnectionError("offline"))
      .mockResolvedValueOnce(mintedFixture());
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    // The spy wraps the FAKE setTimeout, so the delays it was handed are the
    // spacing — `runAllTimersAsync` alone would pass with any delay at all.
    const timer = vi.spyOn(globalThis, "setTimeout");
    try {
      const pending = runCredentialProcess([MOUNT_ID]);
      await vi.runAllTimersAsync();
      const run = await pending;
      expect(mint).toHaveBeenCalledTimes(3);
      expect(timer.mock.calls.map(([, delay]) => delay)).toEqual([2000, 2000]);
      expect(REFRESH_RETRY_DELAY_MS).toBe(2000);
      expect(run.exitCode).toBe(0);
      expect(JSON.parse(run.stdout[0])).toMatchObject({ AccessKeyId: "ASIA_RENEWED_KEY" });
    } finally {
      timer.mockRestore();
      vi.useRealTimers();
    }
  });

  it("stops retrying a backend that never answers inside the SDK's 60 s kill, and records it", async () => {
    writeSession(staleFixture());
    // Each attempt costs the client's full 20 s timeout before it fails.
    mint.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 20_000);
      throw new NexusTimeoutError(20_000);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const startedAt = Date.now();
    try {
      const pending = runCredentialProcess([MOUNT_ID]);
      await vi.runAllTimersAsync();
      const run = await pending;
      // 20 s + 2 s + 20 s = 42 s fits the budget; a third attempt would end at
      // 64 s, past the kill that would leave nothing recorded.
      expect(mint).toHaveBeenCalledTimes(2);
      expect(Date.now() - startedAt).toBeLessThanOrEqual(REFRESH_BUDGET_MS);
      expect(run.exitCode).toBe(8);
      expect(run.stdout).toEqual([]);
      expect(storedSession().lastRefresh).toMatchObject({
        outcome: "failed",
        reason: "timed-out"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after the third network failure and records a transient reason", async () => {
    writeSession(staleFixture());
    mint.mockRejectedValue(new NexusConnectionError("offline"));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const pending = runCredentialProcess([MOUNT_ID]);
      await vi.runAllTimersAsync();
      const run = await pending;
      expect(mint).toHaveBeenCalledTimes(3);
      expect(run.exitCode).toBe(7);
      expect(run.stdout).toEqual([]);
      expect(storedSession().lastRefresh).toMatchObject({
        outcome: "failed",
        reason: "connection-failed"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a missing or damaged session with the remount hint and nothing on stdout", async () => {
    const missing = await runCredentialProcess([MOUNT_ID]);
    expect(missing.exitCode).toBe(9);
    expect(missing.stdout).toEqual([]);
    expect(missing.stderr.join("\n")).toContain("nexus workspace remount <slug>");

    const paths = sessionPathsFor(MOUNT_ID);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.sessionFile, '{"version":1,"mountId":"0123456789abcdef"');
    const damaged = await runCredentialProcess([MOUNT_ID]);
    expect(damaged.exitCode).toBe(9);
    expect(damaged.stdout).toEqual([]);
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses an operand that is not a mount id before touching any file", async () => {
    const run = await runCredentialProcess(["support-docs"]);
    expect(run.exitCode).toBe(5);
    expect(run.stdout).toEqual([]);
    expect(run.stderr.join("\n")).toContain("not a mount id");
  });

  it("--check validates the session and the credential_process line without printing a credential", async () => {
    const session = sessionFixture();
    writeSession(session);
    const paths = sessionPathsFor(MOUNT_ID);
    const good = awsConfigFor({
      execPath: process.execPath,
      entry: fileURLToPath(import.meta.url),
      mountId: MOUNT_ID
    });
    if (!good.ok) throw new Error("fixture must be writable");
    fs.writeFileSync(paths.awsConfigFile, good.text);

    const ok = await runCredentialProcess([MOUNT_ID, "--check"]);
    expect(ok.exitCode).toBe(0);
    expect(mint).not.toHaveBeenCalled();
    const everything = [...ok.stdout, ...ok.stderr].join("\n");
    expect(everything).not.toContain("not-a-secret");
    expect(everything).not.toContain("not-a-token");
    expect(everything).not.toContain("ASIA_STORED_KEY");

    const moved = awsConfigFor({
      execPath: "/nonexistent/node",
      entry: fileURLToPath(import.meta.url),
      mountId: MOUNT_ID
    });
    if (!moved.ok) throw new Error("fixture must be writable");
    fs.writeFileSync(paths.awsConfigFile, moved.text);
    const broken = await runCredentialProcess([MOUNT_ID, "--check"]);
    expect(broken.exitCode).toBe(9);
    expect(broken.stderr.join("\n")).toContain("/nonexistent/node");

    fs.rmSync(paths.awsConfigFile);
    const absent = await runCredentialProcess([MOUNT_ID, "--check"]);
    expect(absent.exitCode).toBe(9);
  });
});
