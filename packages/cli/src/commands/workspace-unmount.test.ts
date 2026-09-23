import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";
import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

/**
 * The state directory is resolved from HOME when `../mount-registry` loads,
 * so the sandbox is set BEFORE any import — `vi.hoisted` runs ahead of them
 * wherever it sits in the file. The direct-engine cases below write real
 * session and cache files under it; nothing here may reach the developer's own
 * `~/.nexus-mcp`. Without the trailing slash macOS puts on TMPDIR: the fs mock
 * below decides "inside the sandbox" by string prefix, against paths
 * `os.homedir()` has already normalised.
 */
const SANDBOX = vi.hoisted(() => {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-workspace-unmount-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { ResolvedProfile } from "../config";
import { buildRootProgram } from "../index";
import { mountKey } from "../mount-registry";
import { setJsonMode } from "../output";
import { awsConfigFor } from "../workspace-direct-mount/aws-config";
import { FUSE_T_LIBRARY, MACFUSE_LIBRARY } from "../workspace-direct-mount/fuse-libraries";
import type { MountSession } from "../workspace-direct-mount/mount-session";
import { readSession } from "../workspace-direct-mount/read-session";
import { sessionPathsFor } from "../workspace-direct-mount/session-paths";
import { stableNodePath } from "../workspace-direct-mount/stable-node-path";
import { writeSession } from "../workspace-direct-mount/write-session";

/**
 * NEX-2360: `unmount` disambiguates by the org recorded at mount time.
 *   - A scoped unmount detaches only the acting org's mount of the slug —
 *     never another org's mount of the same slug.
 *   - When the acting org has no mount but other orgs do, the error lists the
 *     candidates instead of a misleading "No mount recorded".
 *   - When the scope is unknowable, the error lists the candidates and asks the
 *     user to pick — whether there are several or only one. Uniqueness is not
 *     ownership: an unknown scope is what a typo'd `--profile` produces, and
 *     `unmount` OS-detaches a real drive and deletes the row, so the one case
 *     where guessing looks safest is exactly where it destroys another org's
 *     mount. Only a record naming NO org/profile (the anonymous base-URL bucket,
 *     or a legacy pre-NEX-2360 row) is still matched by slug alone.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes,
// which is all this suite needs from @agent-nexus/sdk.
// PARTIAL, via `importOriginal`: this file drives the REAL root program, whose
// full command graph reads exports this list does not carry
// (`LONG_RUNNING_TIMEOUT_MS`). A total mock made the suite fail to COLLECT,
// which reports as `Tests: no tests` — a void run rather than a red.
vi.mock("@agent-nexus/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-nexus/sdk")>();
  class NexusError extends Error {}
  class NexusApiError extends NexusError {}
  class NexusAuthenticationError extends NexusApiError {}
  class NexusConnectionError extends NexusError {}
  class NexusTimeoutError extends NexusConnectionError {
    timeoutMs = 0;
  }
  class NexusClient {}
  return {
    ...actual,
    NexusClient,
    NexusError,
    NexusApiError,
    NexusAuthenticationError,
    NexusConnectionError,
    NexusTimeoutError
  };
});

// Never touch the real OS mount table / umount. `rclone version` answers the
// official build's tag line so a remount's preflight passes; `ps` reports every
// recorded pid as an rclone mount, so a row carrying this process's pid reads
// live; `spawn` returns a live-looking child so the remount records this
// process's pid.
const spawn = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((command: string) => {
    if (command === "rclone") return "rclone v1.74.4\n- go/tags: cmount\n";
    if (command === "ps") return "rclone mount nxws: /Users/me/nexus/acme/support-docs\n";
    return "";
  }),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

// Control auth resolution (the unmount scope) per test.
const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

// The direct engine's one mint on a remount, and the options the client was
// built from — the row's pins, never the shell's.
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

// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes.
// Everything else under the sandbox HOME is real; a path outside it (the
// fixtures' `/a/…` mount points) is created and read as empty without touching
// the disk. FUSE-T is the library "installed" here, so no loader runs.
let registry: Record<string, unknown> = {};
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const inSandbox = (p: unknown): boolean => String(p).startsWith(SANDBOX);
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn((p: string, ...rest: unknown[]) => {
        if (String(p).endsWith("workspace-mounts.json")) return JSON.stringify(registry);
        return (actual.readFileSync as unknown as (...a: unknown[]) => unknown)(p, ...rest);
      }),
      writeFileSync: vi.fn((p: string, data: unknown, ...rest: unknown[]) => {
        if (String(p).endsWith("workspace-mounts.json")) {
          registry = JSON.parse(String(data)) as Record<string, unknown>;
          return;
        }
        (actual.writeFileSync as unknown as (...a: unknown[]) => unknown)(p, data, ...rest);
      }),
      mkdirSync: vi.fn((p: string, ...rest: unknown[]) =>
        inSandbox(p)
          ? (actual.mkdirSync as unknown as (...a: unknown[]) => unknown)(p, ...rest)
          : undefined
      ),
      readdirSync: vi.fn((p: string, ...rest: unknown[]) =>
        inSandbox(p)
          ? (actual.readdirSync as unknown as (...a: unknown[]) => unknown)(p, ...rest)
          : []
      ),
      existsSync: vi.fn((p: string) => {
        if (p === FUSE_T_LIBRARY) return true;
        if (p === MACFUSE_LIBRARY) return false;
        return actual.existsSync(p);
      }),
      openSync: vi.fn(() => 1)
    }
  };
});

const ORG_A_PROFILE: ResolvedProfile = {
  name: "org-a",
  source: "active",
  profile: {
    apiKey: "nxs_a",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    orgName: "Acme"
  }
};

function mountRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    engine: "webdav",
    baseUrl: "https://api.nexusgpt.io",
    mountedAt: "2026-06-24T00:00:00.000Z",
    ...over
  };
}

interface Driven {
  readonly out: unknown;
  readonly lines: string[];
}

async function runWorkspace(
  argv: string[],
  options: { json: boolean } = { json: true }
): Promise<Driven> {
  // The REAL root, and nothing here enters JSON mode. `--json` rides in argv
  // below exactly as a caller types it; the root's own `preAction` hook is what
  // must notice it, and whether it does is part of what this file measures.
  const program = buildRootProgram();
  program.exitOverride();

  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...(options.json ? ["--json"] : []),
      "workspace",
      ...argv
    ]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  }
  return { out: options.json ? JSON.parse(chunks.join("\n")) : null, lines: chunks };
}

async function runUnmount(slug: string): Promise<unknown> {
  return (await runWorkspace(["unmount", slug])).out;
}

/**
 * A fixture row carrying THIS process's pid reads live, and `unmount` then
 * kills it — which would signal the test worker. The spy keeps the liveness
 * probe (signal 0) real and swallows the kill, recording it.
 */
const killed: number[] = [];
let realKill: typeof process.kill;
beforeEach(() => {
  realKill = process.kill;
  vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
    if (signal === 0) return realKill.call(process, pid, 0);
    killed.push(pid);
    return true;
  });
});
afterEach(() => {
  vi.mocked(process.kill).mockRestore();
  killed.length = 0;
});
afterAll(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("nexus workspace unmount (NEX-2360 org scoping)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_ORGANIZATION_ID;
    delete process.env.NEXUS_BASE_URL;
    registry = {};
    process.exitCode = undefined;
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("detaches only the acting org's mount when two orgs mounted the same slug", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      }),
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true, slug: "general-context" });
    // Org B's mount of the same slug must survive untouched.
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("lists the owning orgs when the acting org has no mount of the slug", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as {
      error?: { message?: string };
    };
    const message = out.error?.message ?? "";
    expect(message).toContain('org "Acme"'); // names the acting org that has no mount
    expect(message).toContain('org "Globex"'); // lists the actual owner
    expect(message).toContain("/b/general-context");
    expect(process.exitCode).toBe(1);
    // Nothing was detached or forgotten.
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("lists all candidates instead of guessing when the scope is unknown and ambiguous", async () => {
    // No resolvable auth at all → unknown scope.
    resolveProfile.mockImplementation(() => {
      throw new Error("No profiles configured.");
    });
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      }),
      "org:org_bbb|general-context": mountRow({
        slug: "general-context",
        mountPath: "/b/general-context",
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const out = (await runUnmount("general-context")) as {
      error?: { message?: string };
    };
    const message = out.error?.message ?? "";
    expect(message).toContain("the active org could not be resolved");
    expect(message).toContain('org "Acme"');
    expect(message).toContain('org "Globex"');
    expect(process.exitCode).toBe(1);
    expect(Object.keys(registry).sort()).toEqual([
      "org:org_aaa|general-context",
      "org:org_bbb|general-context"
    ]);
  });

  it("unmounts a unique UNOWNED slug match when the scope is unknown", async () => {
    // The anonymous base-URL bucket: mounted with a raw --api-key and no
    // NEXUS_ORGANIZATION_ID, so the row names no org. Nothing to contradict, and
    // refusing would strand a live mount with no way to detach it.
    resolveProfile.mockImplementation(() => {
      throw new Error("No profiles configured.");
    });
    registry = {
      "url:https://api.nexusgpt.io|general-context": mountRow({
        slug: "general-context",
        mountPath: "/anon/general-context"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true, slug: "general-context" });
    expect(registry).toEqual({});
  });

  it("refuses to detach an OWNED unique match when the scope is unknown", async () => {
    // One org, one mount, one obvious candidate — and the CLI still must not act.
    // An unknown scope is reached by ordinary accident, not only by a deliberate
    // anonymous invocation, and `unmount` OS-detaches a real drive and deletes
    // the row. Uniqueness is not ownership.
    resolveProfile.mockImplementation(() => {
      throw new Error("No profiles configured.");
    });
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as { error?: { message?: string } };
    const message = out.error?.message ?? "";
    expect(message).toContain("the active org could not be resolved");
    expect(message).toContain('org "Acme"');
    expect(message).toContain("/a/general-context");
    expect(message).toContain("--profile");
    expect(process.exitCode).toBe(1);
    // The mount is untouched: still recorded, still attached.
    expect(Object.keys(registry)).toEqual(["org:org_aaa|general-context"]);
  });

  it("does not let a typo'd --profile detach another org's mount", async () => {
    // `resolveProfile` THROWS on an unknown profile name and
    // `resolveScopeBestEffort` swallows that error — so `--profile acmee` for
    // `acme` lands in exactly the unknown-scope state above. Before the owner
    // check, the unique slug match made that typo silently unmount org A.
    resolveProfile.mockImplementation(() => {
      throw new Error('Profile "acmee" (from --profile flag) not found. Available: org-a');
    });
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as { error?: { message?: string } };
    expect(out.error?.message ?? "").toContain('org "Acme"');
    expect(process.exitCode).toBe(1);
    expect(Object.keys(registry)).toEqual(["org:org_aaa|general-context"]);
  });

  it("removes a legacy bare-slug record (migrate-on-first-touch)", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = {
      "general-context": mountRow({
        slug: "general-context",
        mountPath: "/legacy/general-context"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toMatchObject({ unmounted: true });
    expect(registry).toEqual({});
  });

  it("refuses to detach an org's mount for a profile named after that org's id", async () => {
    // Profile names allow `org_aaa` (config.ts: ^[a-z0-9][a-z0-9_-]{0,31}$), and
    // a profile with no selected org is keyed by its NAME. In a flat key space
    // that name IS org A's registry key, so this unmount would detach org A's
    // live drive and delete its row. The kind tag keeps the two spaces disjoint:
    // this profile addresses `profile:org_aaa|…`, never `org:org_aaa|…`.
    resolveProfile.mockReturnValue({
      name: "org_aaa",
      source: "active",
      profile: { apiKey: "nxs_impostor", baseUrl: "https://api.nexusgpt.io" }
    } as ResolvedProfile);
    // Keyed through `mountKey` rather than a literal, so this stays a real test
    // of the KEY SPACE: it fails the moment org ids and profile names share one.
    const orgAKey = mountKey(
      {
        profile: "org-a",
        orgId: "org_aaa",
        orgName: "Acme",
        baseUrl: "https://api.nexusgpt.io"
      },
      "general-context"
    );
    registry = {
      [orgAKey]: mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as { error?: { message?: string } };
    expect(out.error?.message).toContain('org "Acme"');
    expect(process.exitCode).toBe(1);
    // Org A's mount is still recorded — nothing was detached on its behalf.
    expect(Object.keys(registry)).toEqual([orgAKey]);
  });

  it("still reports a plain no-mount error when the slug is not mounted anywhere", async () => {
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    const out = (await runUnmount("ghost")) as { error?: { message?: string } };
    expect(out.error?.message).toContain('No mount recorded for "ghost"');
    expect(process.exitCode).toBe(1);
  });
});

// ── The direct engine: unmount keeps unsent saves, remount drains them ────────

const MOUNT_ID = "0123456789abcdef";
const BUCKET = "nxw-d-0123456789ab";
const DIRECT_MOUNT_PATH = path.join(SANDBOX, "nexus", "acme", "support-docs");

function isoIn(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function directRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "support-docs",
    engine: "direct",
    mountPath: DIRECT_MOUNT_PATH,
    baseUrl: "https://api.nexusgpt.io",
    mountId: MOUNT_ID,
    access: "read-write",
    workspaceId: "ws-1",
    shared: false,
    readOnly: false,
    orgId: "org_aaa",
    orgName: "Acme",
    profile: "org-a",
    pid: process.pid,
    mountedAt: "2026-09-07T12:00:00.000Z",
    ...over
  };
}

function sessionFixture(over: Partial<MountSession> = {}): MountSession {
  return {
    version: 1,
    mountId: MOUNT_ID,
    profile: "org-a",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    workspace: { id: "ws-1", slug: "support-docs", shared: false },
    access: "read-write",
    volumeName: "Support Docs (Acme)",
    credentials: {
      accessKeyId: "ASIA_OLD_KEY",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: isoIn(40 * 60 * 1000),
    mintedAt: isoIn(-20 * 60 * 1000),
    ...over
  };
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
    storage: { bucket: BUCKET, prefix: "support-docs/", region: "eu-west-3" },
    credentials: {
      accessKeyId: "ASIA_FRESH_KEY",
      secretAccessKey: "fresh-secret",
      sessionToken: "fresh-token"
    },
    expiresAt: isoIn(60 * 60 * 1000),
    ...over
  };
}

/** rclone's cache, holding `count` saves the dead mount never uploaded. */
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
}

/** A clean cache: one fully uploaded item in the data tree, nothing dirty. */
function leaveCleanCache(): void {
  const dataRoot = path.join(
    sessionPathsFor(MOUNT_ID).cacheDir,
    "vfs",
    "nxws{abc}",
    "support-docs"
  );
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, "readme.md"), "uploaded");
}

type ErrorDocument = { error?: { message?: string; hint?: string; code?: string } };

describe("nexus workspace unmount — a direct row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_ORGANIZATION_ID;
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    registry = { "org:org_aaa|support-docs": directRow() };
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    writeSession(sessionFixture());
    process.exitCode = undefined;
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("kills the recorded process, deletes the session directory and an EMPTY cache, and says how long the last key lives", async () => {
    const session = sessionFixture();
    writeSession(session);
    const paths = sessionPathsFor(MOUNT_ID);
    fs.mkdirSync(paths.cacheDir, { recursive: true });

    const out = (await runUnmount("support-docs")) as Record<string, unknown>;

    expect(out).toEqual({
      unmounted: true,
      slug: "support-docs",
      pendingUploads: 0,
      accessValidUntil: session.expiresAt
    });
    expect(killed).toEqual([process.pid]);
    expect(fs.existsSync(paths.dir)).toBe(false);
    expect(fs.existsSync(paths.cacheDir)).toBe(false);
    expect(registry).toEqual({});
  });

  it("KEEPS a cache that holds anything — dirty saves counted, a clean item too — and names the remount", async () => {
    leaveDirtyItems(2);
    const paths = sessionPathsFor(MOUNT_ID);

    const out = (await runUnmount("support-docs")) as Record<string, unknown>;

    expect(out).toMatchObject({ unmounted: true, pendingUploads: 2 });
    expect(fs.existsSync(paths.dir)).toBe(false);
    expect(fs.existsSync(paths.cacheDir)).toBe(true);

    // The human channel says it in one line, with the command that drains it —
    // `mount`, not `remount`: the row is gone once unmount returns, and a
    // fresh direct mount under the same org lands on the same cache directory.
    registry = { "org:org_aaa|support-docs": directRow() };
    writeSession(sessionFixture());
    const { lines } = await runWorkspace(["unmount", "support-docs"], { json: false });
    const text = lines.join("\n");
    expect(text).toContain(
      "2 file(s) not yet uploaded; nexus workspace mount support-docs --engine direct uploads them"
    );
    expect(text).toContain("stays valid until");
    expect(text).toContain("no revoke call");

    // A cache with only a clean, uploaded item is still not deleted: rclone's
    // own bookkeeping decides what is dirty, this CLI only refuses to guess.
    fs.rmSync(paths.cacheDir, { recursive: true, force: true });
    leaveCleanCache();
    registry = { "org:org_aaa|support-docs": directRow() };
    writeSession(sessionFixture());
    const clean = (await runUnmount("support-docs")) as Record<string, unknown>;
    expect(clean).toMatchObject({ pendingUploads: 0 });
    expect(fs.existsSync(paths.cacheDir)).toBe(true);
  });

  it("says UNKNOWN, never Infinity and never null, when the cache cannot be read", async () => {
    // The unknown sentinel is infinite so both in-process comparisons fail
    // safe. Two surfaces must not see it raw: a human would read "Infinity
    // file(s)", and `JSON.stringify` renders infinity as `null` — the value the
    // help defines as "null on other engines", i.e. nothing to lose. A script
    // gating teardown on `pendingUploads === null || === 0` would then discard
    // a cache holding every unsent save.
    const paths = sessionPathsFor(MOUNT_ID);
    fs.rmSync(paths.cacheDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(paths.cacheDir, "vfsMeta", "locked"), { recursive: true });
    fs.writeFileSync(path.join(paths.cacheDir, "vfsMeta", "locked", "item"), '{"Dirty":true}');
    fs.chmodSync(path.join(paths.cacheDir, "vfsMeta", "locked"), 0o000);
    registry = { "org:org_aaa|support-docs": directRow() };
    writeSession(sessionFixture());
    try {
      const doc = (await runUnmount("support-docs")) as Record<string, unknown>;
      expect(doc.pendingUploads).toBe("unknown");
      expect(doc.pendingUploads).not.toBeNull();
      expect(JSON.stringify(doc)).not.toContain("Infinity");
    } finally {
      fs.chmodSync(path.join(paths.cacheDir, "vfsMeta", "locked"), 0o700);
    }
  });

  it("leaves the two fields null on a webdav row", async () => {
    registry = {
      "org:org_aaa|general-context": mountRow({
        slug: "general-context",
        mountPath: "/a/general-context",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      })
    };
    const out = (await runUnmount("general-context")) as Record<string, unknown>;
    expect(out).toEqual({
      unmounted: true,
      slug: "general-context",
      pendingUploads: null,
      accessValidUntil: null
    });
  });
});

describe("nexus workspace remount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_ORGANIZATION_ID;
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    clientOpts.length = 0;
    mint.mockReset();
    mint.mockResolvedValue(mintedFixture());
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    // A dead direct row: the drive died at logout, the row and the cache
    // survived. `pid: undefined` is how a dead one reads.
    registry = { "org:org_aaa|support-docs": directRow({ pid: undefined }) };
    process.exitCode = undefined;
  });
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  it("refuses a row that is still live, naming the path", async () => {
    registry = { "org:org_aaa|support-docs": directRow() };
    const { out } = await runWorkspace(["remount", "support-docs"]);
    expect((out as ErrorDocument).error?.message).toContain(
      `"support-docs" is already mounted at ${DIRECT_MOUNT_PATH}`
    );
    expect(process.exitCode).toBe(1);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  const rcloneRow = {
    "org:org_aaa|tools": {
      slug: "tools",
      engine: "rclone",
      mountPath: path.join(SANDBOX, "nexus", "acme", "tools"),
      baseUrl: "https://api.nexusgpt.io",
      readOnly: false,
      orgId: "org_aaa",
      orgName: "Acme",
      profile: "org-a",
      mountedAt: "2026-06-24T00:00:00.000Z"
    }
  };

  it("refuses an rclone row on macOS, where that engine is retired, naming direct and the WebDAV default", async () => {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    if (!real) throw new Error("process.platform has no descriptor to restore");
    Object.defineProperty(process, "platform", { ...real, value: "darwin" });
    try {
      registry = rcloneRow;
      const { out } = await runWorkspace(["remount", "tools"]);
      const doc = out as ErrorDocument;
      expect(doc.error?.message).toContain("retired on macOS");
      // 🔴 NOT "--engine direct": `remount` registers no `--engine` and no
      // `--read-only`, it replays the engine the row recorded. Naming a flag
      // here is an instruction the caller cannot type, on a row they then
      // cannot move at all. The pair that CAN change an engine is named.
      expect(doc.error?.hint).toContain("nexus workspace unmount");
      expect(doc.error?.hint).toContain("nexus workspace mount");
      expect(doc.error?.hint).not.toContain("--engine direct");
      expect(doc.error?.code).toBe("CLI_INVALID_ARGUMENTS");
      expect(mint).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", real);
    }
  });

  it("refuses an engine this CLI does not have, rather than reporting a mount it never made", async () => {
    // `mount` reaches its engine through `isEngine`; `remount` read it off a row
    // `readMounts` parses and CASTS. An unrecognised value walked past the
    // platform refusal's if-chain into the dispatch switch, whose `satisfies
    // never` arm RETURNS at runtime — so `mounted.record` was undefined, the
    // spread wrote nothing, the registry was rewritten, and the command printed
    // "Remounted" having mounted nothing.
    registry = {
      "org:org_aaa|support-docs": { ...directRow({ pid: undefined }), engine: "quantum" }
    };

    const { out } = await runWorkspace(["remount", "support-docs"]);
    const doc = out as ErrorDocument;

    expect(doc.error?.message).toContain('engine "quantum"');
    expect(doc.error?.hint).toContain("nexus workspace unmount support-docs");
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("refuses a row that records no read-only mode rather than assuming read-write", async () => {
    // A row written before the CLI stored the mode says nothing about what was
    // asked for — `status` prints `Mode ?` for exactly that reason. Defaulting
    // it to read-write resolves the silence to the more permissive answer: a
    // drive deliberately mounted `--read-only` returns writable, and the row is
    // rewritten claiming `rw`, so the honest unknown is gone with it.
    const { readOnly: _dropped, ...noMode } = directRow({ pid: undefined });
    registry = { "org:org_aaa|support-docs": noMode };

    const { out } = await runWorkspace(["remount", "support-docs"]);
    const doc = out as ErrorDocument;

    expect(doc.error?.message).toContain("records no read-only mode");
    expect(doc.error?.hint).toContain("nexus workspace unmount support-docs");
    expect(doc.error?.hint).toContain("--read-only");
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("remounts an rclone row on Linux the ordinary way: the gateway over FUSE, the key in the environment, no mint", async () => {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    if (!real) throw new Error("process.platform has no descriptor to restore");
    Object.defineProperty(process, "platform", { ...real, value: "linux" });
    try {
      registry = rcloneRow;
      const { out } = await runWorkspace(["remount", "tools"]);
      expect(out).toMatchObject({
        remounted: true,
        engine: "rclone",
        mountId: null,
        access: null,
        pendingUploads: null,
        pid: process.pid
      });
      expect(mint).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(1);
      const [, argv, options] = spawn.mock.calls[0] as [
        string,
        string[],
        { env: NodeJS.ProcessEnv }
      ];
      expect(argv.slice(0, 2)).toEqual(["mount", ":webdav:"]);
      expect(options.env.RCLONE_WEBDAV_URL).toBe("https://api.nexusgpt.io/api/dav/tools");
      expect(options.env.RCLONE_WEBDAV_HEADERS).toBe("api-key,nxs_a");
    } finally {
      Object.defineProperty(process, "platform", real);
    }
  });

  it("lists the owning orgs when the acting org has no row for the slug, and says how to mount an unrecorded one", async () => {
    registry = {
      "org:org_bbb|support-docs": directRow({
        pid: undefined,
        orgId: "org_bbb",
        orgName: "Globex",
        profile: "org-b"
      })
    };
    const miss = await runWorkspace(["remount", "support-docs"]);
    const message = (miss.out as ErrorDocument).error?.message ?? "";
    expect(message).toContain('org "Acme"');
    expect(message).toContain('org "Globex"');
    expect(message).toContain("nexus auth switch");
    expect(mint).not.toHaveBeenCalled();

    registry = {};
    const none = await runWorkspace(["remount", "ghost"]);
    expect((none.out as ErrorDocument).error?.message).toContain("nexus workspace mount ghost");
  });

  it("re-mints under the ROW's pins, keeps the mount id and cache, rewrites the session and config, and re-spawns", async () => {
    // The detach asserted below is spelled the macOS way (`umount <path>`);
    // Linux spells it `fusermount -u`, so the case runs as darwin like its
    // siblings rather than reading the runner's platform.
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    if (!real) throw new Error("process.platform has no descriptor to restore");
    Object.defineProperty(process, "platform", { ...real, value: "darwin" });
    onTestFinished(() => {
      Object.defineProperty(process, "platform", real);
    });
    // A second profile signed into the same org runs the remount; the ROW's
    // profile is the one the renewal must keep re-reading its key from.
    resolveProfile.mockReturnValue({ ...ORG_A_PROFILE, name: "acme-admin" });
    leaveDirtyItems(3);
    // The dead mount's session: an old key, soon to be replaced.
    writeSession(sessionFixture());
    const oldConfig = awsConfigFor({
      execPath: "/old/node",
      entry: "/old/cli.js",
      mountId: MOUNT_ID
    });
    if (!oldConfig.ok) throw new Error("fixture must be writable");
    fs.writeFileSync(sessionPathsFor(MOUNT_ID).awsConfigFile, oldConfig.text);

    // An explicit --api-key on the command must not reach the mint either: it
    // would outrank the profile inside createClient and mint under a key the
    // hourly renewal can never re-read.
    const { out } = await runWorkspace(["remount", "support-docs", "--api-key", "nxs_other"]);

    expect(out).toEqual({
      remounted: true,
      slug: "support-docs",
      engine: "direct",
      mountPath: DIRECT_MOUNT_PATH,
      readOnly: false,
      pid: process.pid,
      mountId: MOUNT_ID,
      access: "read-write",
      pendingUploads: 3
    });
    expect(clientOpts).toHaveLength(1);
    expect(clientOpts[0]).toMatchObject({
      profile: "org-a",
      organizationId: "org_aaa",
      baseUrl: "https://api.nexusgpt.io"
    });
    expect(clientOpts[0]).not.toHaveProperty("apiKey");
    expect(mint).toHaveBeenCalledWith("support-docs", { access: "read-write" });

    // A crashed FUSE process can leave its mount-table entry behind, under
    // which the path answers ENOTCONN to every read: the dead row is detached
    // best-effort BEFORE the mount point is checked and reused.
    expect(execFileSync).toHaveBeenCalledWith("umount", [DIRECT_MOUNT_PATH], expect.anything());

    // The SAME mount id means the same --cache-dir, so rclone drains the three
    // dirty items on start.
    expect(spawn).toHaveBeenCalledTimes(1);
    const argv = spawn.mock.calls[0][1] as string[];
    expect(argv[argv.indexOf("--cache-dir") + 1]).toBe(sessionPathsFor(MOUNT_ID).cacheDir);
    expect(argv.join(" ")).not.toContain(BUCKET);
    expect(fs.existsSync(sessionPathsFor(MOUNT_ID).cacheDir)).toBe(true);

    // Fresh session under the same id, fresh config naming THIS node and entry.
    const read = readSession(MOUNT_ID);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.session.credentials.accessKeyId).toBe("ASIA_FRESH_KEY");
    expect(read.session.orgId).toBe("org_aaa");
    const config = fs.readFileSync(sessionPathsFor(MOUNT_ID).awsConfigFile, "utf-8");
    expect(config).toContain(`"${stableNodePath()}"`);
    expect(config).not.toContain("/old/node");

    // The row is updated in place: same key, new pid, everything else kept.
    expect(Object.keys(registry)).toEqual(["org:org_aaa|support-docs"]);
    expect(registry["org:org_aaa|support-docs"]).toMatchObject({
      engine: "direct",
      mountId: MOUNT_ID,
      pid: process.pid,
      readOnly: false,
      orgId: "org_aaa",
      profile: "org-a"
    });
  });

  it("refuses to come back READ-ONLY while unsent saves exist — granted OR asked for — naming the cache and the two ways out", async () => {
    leaveDirtyItems(2);
    mint.mockResolvedValue(mintedFixture({ access: "read" }));

    const { out } = await runWorkspace(["remount", "support-docs"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain('2 file(s) saved to "support-docs" have not uploaded yet');
    expect(doc.error?.message).toContain("Nexus now grants read-only access");
    expect(doc.error?.hint).toContain("restore write access");
    expect(doc.error?.hint).toContain(`${sessionPathsFor(MOUNT_ID).cacheDir}/vfs`);
    expect(doc.error?.hint).toContain("discard them");
    expect(doc.error?.code).toBe("CLI_LOCAL_FAILED");
    expect(spawn).not.toHaveBeenCalled();
    // The cache is untouched, and the row stays dead rather than half-updated.
    expect(fs.existsSync(sessionPathsFor(MOUNT_ID).cacheDir)).toBe(true);
    expect(registry["org:org_aaa|support-docs"]).toMatchObject({ pid: undefined });

    // The same guard for a mode the USER asked for — and this one costs no mint.
    vi.clearAllMocks();
    mint.mockResolvedValue(mintedFixture());
    registry = { "org:org_aaa|support-docs": directRow({ pid: undefined, readOnly: true }) };
    const requested = await runWorkspace(["remount", "support-docs"]);
    const requestedDoc = requested.out as ErrorDocument;
    expect(requestedDoc.error?.message).toContain("--read-only was asked for");
    expect(requestedDoc.error?.hint).toContain("drop --read-only");
    expect(mint).not.toHaveBeenCalled();
  });

  it("asks for the mode RECORDED AS REQUESTED, so a drive once granted read comes back read-write when the grant returns", async () => {
    // The row: read-write was asked for, read was granted last time.
    registry = {
      "org:org_aaa|support-docs": directRow({ pid: undefined, readOnly: false, access: "read" })
    };
    writeSession(sessionFixture({ access: "read" }));

    const { out } = await runWorkspace(["remount", "support-docs"]);

    expect(mint).toHaveBeenCalledWith("support-docs", { access: "read-write" });
    expect(out).toMatchObject({ remounted: true, readOnly: false, access: "read-write" });
    expect(registry["org:org_aaa|support-docs"]).toMatchObject({
      readOnly: false,
      access: "read-write"
    });
  });

  it("remounts a dead webdav row the ordinary way, with a fresh mount token", async () => {
    const real = Object.getOwnPropertyDescriptor(process, "platform");
    if (!real) throw new Error("process.platform has no descriptor to restore");
    Object.defineProperty(process, "platform", { ...real, value: "darwin" });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "dav-token" })));
    try {
      const mountPath = path.join(SANDBOX, "nexus", "acme", "general-context");
      registry = {
        "org:org_aaa|general-context": mountRow({
          slug: "general-context",
          mountPath,
          readOnly: true,
          orgId: "org_aaa",
          orgName: "Acme",
          profile: "org-a"
        })
      };

      const { out } = await runWorkspace(["remount", "general-context"]);

      expect(out).toMatchObject({
        remounted: true,
        engine: "webdav",
        readOnly: true,
        mountId: null
      });
      expect(mint).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(process, "platform", real);
    }
  });
});
