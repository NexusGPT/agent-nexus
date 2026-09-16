import fs from "node:fs";
import path from "node:path";

import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";
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
  // Without the trailing slash macOS puts on TMPDIR: the fs mock below decides
  // "inside the sandbox" by string prefix, against paths `os.homedir()` has
  // already normalised.
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
  const dir = `${tmp}/nexus-workspace-mount-collision-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { ResolvedProfile } from "../config";
import { LOG_DIR } from "../mount-registry";
import { setJsonMode } from "../output";
import {
  DIRECT_MOUNT_INTRO_MARKER,
  FUSE_T_LIBRARY,
  MACFUSE_LIBRARY,
  MACFUSE_LOADER,
  mountIdFor,
  readSession,
  sessionPathsFor,
  stableNodePath,
  writeSession
} from "../workspace-direct-mount";

/**
 * NEX-2360 follow-up: org-scoping the registry KEY does not scope the mount
 * POINT. `defaultMountPath` now carries the org (`~/nexus/<org>/<slug>`), but
 * `--at` names any directory and rows written before the org segment existed
 * sit at `~/nexus/<slug>`, so two orgs can still aim at one path while their
 * scoped registry lookups see nothing of each other.
 *
 * Left unguarded that lets the registry hold TWO rows naming one mount point,
 * which is corrupting: every OS-level action keys off `mountPath`, so
 * `unmount` under org A detaches whatever is mounted there — org B's live
 * drive. These cover the guard that keeps one row per mount point:
 *   - a LIVE row on the path refuses the mount, naming its owner and --at;
 *   - a DEAD row on the path is reclaimed (dropped) as the new mount takes it.
 *
 * The second half of the file drives the DIRECT engine end to end over the
 * same harness: its refusals before any mint, the argv and environment rclone
 * is spawned with, the registry row, the fail-fast cleanup and the footer.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes.
// PARTIAL, via `importOriginal`: `workspace.ts` also reads the SDK's timeout
// constant at load, and a total mock makes the suite fail to COLLECT — which
// reports as no tests, not as a red.
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

// The workspace list is irrelevant here — a failing list degrades to the plain
// bare-slug mount (resolveMountTarget → null), which is what we want to test.
// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
const mint = vi.fn<(slug: string, body: unknown) => Promise<WorkspaceMountCredentials>>();
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: vi.fn(() => ({
    workspaces: {
      list: vi.fn(async () => {
        throw new Error("offline");
      }),
      mintMountCredentials: mint
    }
  }))
}));

// Never shell out: an empty mount table makes every webdav record read as NOT
// live; `rclone version` answers the official build's tag line unless a case
// says otherwise; the macFUSE loader succeeds unless a case makes it fail; `ps`
// reports every recorded pid as an rclone mount, so a row carrying this
// process's pid reads live.
const spawn = vi.fn();
let rcloneVersion: string | Error = "rclone v1.74.4\n- go/tags: cmount\n";
let macFuseLoader: Error | null = null;
const PS_RCLONE = "rclone mount nxws: /Users/me/nexus/acme/general-context\n";
let psAnswer: string | Error = PS_RCLONE;
const execFileSync = vi.fn((command: string) => {
  if (command === "rclone") {
    if (rcloneVersion instanceof Error) throw rcloneVersion;
    return rcloneVersion;
  }
  if (command === "ps") {
    if (psAnswer instanceof Error) throw psAnswer;
    return psAnswer;
  }
  if (command === MACFUSE_LOADER && macFuseLoader !== null) throw macFuseLoader;
  return "";
});
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...(args as [string])),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes.
// Everything else under the sandbox HOME is real; a path outside it (an `--at`
// elsewhere) is created and read as empty without touching the disk.
let registry: Record<string, unknown> = {};
/** Which FUSE libraries "exist" on this Mac — FUSE-T alone by default. */
let libraries: Record<string, boolean> = { [FUSE_T_LIBRARY]: true, [MACFUSE_LIBRARY]: false };
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
      // The mount point is always empty, so `ensureEmptyMountDir` never blocks —
      // a collision must be caught by the registry guard, not by the OS.
      readdirSync: vi.fn((p: string, ...rest: unknown[]) =>
        inSandbox(p)
          ? (actual.readdirSync as unknown as (...a: unknown[]) => unknown)(p, ...rest)
          : []
      ),
      existsSync: vi.fn((p: string) => (p in libraries ? libraries[p] : actual.existsSync(p))),
      openSync: vi.fn(() => 1)
    }
  };
});

// Control auth resolution (the acting org) per test.
const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

import { registerWorkspaceCommands } from "./workspace";

const SLUG = "general-context";
const BUCKET = "nxw-d-0123456789ab";
/** Org A's default mount point: the org NAME, slugified, between ~/nexus and the slug. */
const ORG_A_DEFAULT_PATH = path.join(SANDBOX, "nexus", "acme", SLUG);

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

const OVERRIDE_PROFILE: ResolvedProfile = {
  name: "override",
  source: "override",
  profile: { apiKey: "nxs_raw_key", baseUrl: "https://api.nexusgpt.io" }
};

/** A registry row owned by org B (Globex), parked on org A's default mount point. */
function orgBRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: SLUG,
    mountPath: ORG_A_DEFAULT_PATH,
    baseUrl: "https://api.nexusgpt.io",
    mountedAt: "2026-06-24T00:00:00.000Z",
    orgId: "org_bbb",
    orgName: "Globex",
    profile: "org-b",
    ...over
  };
}

function mintedFixture(over: Partial<WorkspaceMountCredentials> = {}): WorkspaceMountCredentials {
  return {
    workspace: { id: "ws-gc", slug: SLUG, name: "General Context", kind: "DRIVE", isShared: false },
    organization: { id: "org_aaa", name: "Acme" },
    access: "read-write",
    storage: { bucket: BUCKET, prefix: `${SLUG}/`, region: "eu-west-3" },
    credentials: {
      accessKeyId: "ASIA_MINTED_KEY",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...over
  };
}

interface Driven {
  readonly out: unknown;
  readonly lines: string[];
  readonly warnings: string;
  readonly errors: string;
}

async function runMount(
  args: string[],
  options: { json: boolean } = { json: true }
): Promise<Driven> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(options.json);
  const lines: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(" "));
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    warnings.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...(options.json ? ["--json"] : []),
      "workspace",
      "mount",
      ...args
    ]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  }
  const out = options.json ? JSON.parse(lines.join("\n")) : null;
  return { out, lines, warnings: warnings.join(""), errors: errors.join("\n") };
}

type ErrorDocument = { error?: { message?: string; hint?: string; code?: string } };

/** The argv and env rclone was spawned with — the mount itself. */
function spawned(): { argv: string[]; env: NodeJS.ProcessEnv } {
  expect(spawn).toHaveBeenCalledTimes(1);
  const [, argv, options] = spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
  return { argv, env: options.env };
}

const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");
function pretendPlatform(platform: NodeJS.Platform): void {
  if (!REAL_PLATFORM) throw new Error("process.platform has no descriptor to restore");
  Object.defineProperty(process, "platform", { ...REAL_PLATFORM, value: platform });
}

/** Saves a previous mount left in the cache: rclone's own dirty markers under vfsMeta. */
function leaveDirtyItems(mountId: string, count: number): void {
  const metaRoot = path.join(sessionPathsFor(mountId).cacheDir, "vfsMeta", "nxws{abc}", SLUG);
  fs.mkdirSync(metaRoot, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    fs.writeFileSync(
      path.join(metaRoot, `draft-${String(index)}.md`),
      JSON.stringify({ Dirty: true })
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProfile.mockReturnValue(ORG_A_PROFILE);
  delete process.env.NEXUS_ORGANIZATION_ID;
  delete process.env.NEXUS_BASE_URL;
  registry = {};
  rcloneVersion = "rclone v1.74.4\n- go/tags: cmount\n";
  macFuseLoader = null;
  psAnswer = PS_RCLONE;
  libraries = { [FUSE_T_LIBRARY]: true, [MACFUSE_LIBRARY]: false };
  process.exitCode = undefined;
  // A live rclone mount is one whose recorded pid is alive; this process is.
  spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
  mint.mockReset();
  mint.mockResolvedValue(mintedFixture());
  // The WebDAV engine mints its mount token over a raw `fetch`; nothing here
  // may reach a network.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "dav-token" })));
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (REAL_PLATFORM) Object.defineProperty(process, "platform", REAL_PLATFORM);
  setJsonMode(false);
  process.exitCode = undefined;
});
afterAll(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("nexus workspace mount — cross-org mount-point collision", () => {
  it("refuses to mount onto another org's LIVE mount point and points at --at", async () => {
    // Org B parked its mount on org A's default directory with --at. Org A's
    // scoped lookup finds nothing (different registry key), so only the
    // mount-point check can stop this — and it must, or two rows end up naming
    // one directory.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain(ORG_A_DEFAULT_PATH);
    expect(message).toContain('org "Globex"'); // names who is in the way
    expect(message).toContain("--at"); // and how to coexist
    expect(process.exitCode).toBe(1);
    // Nothing minted, nothing mounted, nothing recorded, org B's row untouched.
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(Object.keys(registry)).toEqual(["org:org_bbb|general-context"]);
  });

  it("treats a REUSED pid as dead: alive, but not an rclone mount, so the row is reclaimed rather than defended", async () => {
    // The recorded pid is alive (it is this process) but `ps` shows it is not
    // rclone — the mount died and the OS handed its pid to something else. A
    // liveness check that stops at the signal would refuse this mount as a
    // collision and let `unmount` kill a stranger.
    psAnswer = "/usr/bin/vitest run --reporter=dot\n";
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };

    const { out, warnings } = await runMount([SLUG, "--engine", "direct"]);

    expect(out).toMatchObject({ mounted: true, slug: SLUG, mountPath: ORG_A_DEFAULT_PATH });
    expect(warnings).toContain("Reclaiming");
    expect(registry["org:org_bbb|general-context"]).toBeUndefined();
    expect(execFileSync).toHaveBeenCalledWith(
      "ps",
      ["-o", "command=", "-p", String(process.pid)],
      expect.anything()
    );
  });

  it("treats an UNREADABLE `ps` as still-running, so a stripped container does not detach a live drive", async () => {
    // The other direction of the probe above, and the dangerous one. `ps` is
    // absent or option-incompatible on busybox/distroless images. Reading the
    // throw as "dead" would reclaim the path: `fusermount -u` on a live
    // `--vfs-cache-mode writes` drive discards whatever has not uploaded. The
    // signal check already proved a process is there, so an unreadable command
    // line leaves that answer standing.
    psAnswer = Object.assign(new Error("spawnSync ps ENOENT"), { code: "ENOENT" });
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect((out as ErrorDocument).error?.message).toContain("already in use");
    expect(process.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(registry["org:org_bbb|general-context"]).toBeDefined();
  });

  it("reclaims a DEAD row on the mount point instead of leaving two rows on it", async () => {
    // Org B's mount is gone (reboot / manual umount) but its row survives. Left
    // in place it would describe org A's new drive, and `unmount` as org B
    // would detach a mount it never made.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "webdav" })
    };

    const { out, warnings } = await runMount([SLUG, "--engine", "direct"]);

    expect(out).toMatchObject({ mounted: true, slug: SLUG, mountPath: ORG_A_DEFAULT_PATH });
    expect(warnings).toContain("Reclaiming");
    expect(warnings).toContain('org "Globex"');
    // Exactly one row, org A's, naming the mount point.
    expect(Object.keys(registry)).toEqual(["org:org_aaa|general-context"]);
    expect(registry["org:org_aaa|general-context"]).toMatchObject({
      mountPath: ORG_A_DEFAULT_PATH,
      orgId: "org_aaa"
    });
  });

  it("lets a second org mount the same slug at a different path", async () => {
    // The PR's core promise: org-scoped keys let both orgs keep a mount of the
    // slug, as long as the mount POINTS differ.
    registry = {
      "org:org_bbb|general-context": orgBRow({ engine: "rclone", pid: process.pid })
    };
    const other = path.join(SANDBOX, "nexus", "acme-general-context");

    const { out } = await runMount([SLUG, "--engine", "direct", "--at", other]);

    expect(out).toMatchObject({ mounted: true, mountPath: other });
    expect(Object.keys(registry).sort()).toEqual([
      "org:org_aaa|general-context",
      "org:org_bbb|general-context"
    ]);
  });

  it("tells an anonymous caller the blocking row may be another org's, not to unmount it", async () => {
    // The `url:` bucket is ONE entry per (base URL, slug), shared by every caller
    // that arrives with a raw --api-key and no NEXUS_ORGANIZATION_ID — the CLI
    // has nothing to tell them apart with. So a second org mounting the same slug
    // anonymously is blocked by the first org's row, at a DIFFERENT path, through
    // the slug guard rather than the mount-point guard.
    //
    // The block itself is the safe outcome (better than overwriting a live row).
    // What must not happen is the generic "Unmount it first.", which would send
    // org B to detach org A's drive. The error has to name what the row is and
    // how to leave the shared bucket.
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);
    registry = {
      "url:https://api.nexusgpt.io|general-context": {
        slug: SLUG,
        engine: "rclone",
        pid: process.pid, // live
        mountPath: "/first-org/general-context",
        baseUrl: "https://api.nexusgpt.io",
        mountedAt: "2026-06-24T00:00:00.000Z"
        // No orgId / orgName / profile — that is what "anonymous" means here.
      }
    };
    const other = path.join(SANDBOX, "nexus", "second-org-general-context");

    const { out } = await runMount([SLUG, "--engine", "direct", "--at", other]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("/first-org/general-context");
    expect(message).toContain("names no organization");
    expect(message).toContain("NEXUS_ORGANIZATION_ID");
    // The instruction that would have been destructive across orgs.
    expect(message).not.toContain("Unmount it first");
    expect(process.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(Object.keys(registry)).toEqual(["url:https://api.nexusgpt.io|general-context"]);
  });

  it("still says 'Unmount it first' when the blocking row is demonstrably the caller's own", async () => {
    // The counterpart: org A's own live row. Ownership is established, so the
    // plain instruction is correct and must not be diluted by the branch above.
    registry = {
      "org:org_aaa|general-context": {
        slug: SLUG,
        engine: "rclone",
        pid: process.pid,
        mountPath: ORG_A_DEFAULT_PATH,
        baseUrl: "https://api.nexusgpt.io",
        mountedAt: "2026-06-24T00:00:00.000Z",
        orgId: "org_aaa",
        orgName: "Acme",
        profile: "org-a"
      }
    };

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain('org "Acme"');
    expect(message).toContain("Unmount it first");
    expect(process.exitCode).toBe(1);
  });
});

// ── The direct engine, end to end ─────────────────────────────────────────────

describe("nexus workspace mount --engine — which engine runs where, and the default path", () => {
  it("refuses --engine rclone on macOS as retired there, naming direct and the WebDAV default, before any auth", async () => {
    pretendPlatform("darwin");
    const { out } = await runMount([SLUG, "--engine", "rclone"]);
    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("--engine rclone is retired on macOS");
    expect(doc.error?.hint).toContain("--engine direct");
    expect(doc.error?.hint).toContain("drop --engine");
    expect(doc.error?.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Linux, auto is rclone over the gateway: the key in the environment, no mint, no cmount tag needed", async () => {
    pretendPlatform("linux");
    // Linux rclone mounts without the `cmount` build tag; only macOS and
    // Windows builds need it. A Homebrew-shaped tag line must pass here.
    rcloneVersion = "rclone v1.74.4\n- go/tags: none\n";

    const { out } = await runMount([SLUG]);

    expect(out).toMatchObject({
      mounted: true,
      engine: "rclone",
      mountPath: ORG_A_DEFAULT_PATH,
      mountId: null,
      access: null,
      pendingUploads: null
    });
    const { argv, env } = spawned();
    expect(argv.slice(0, 3)).toEqual(["mount", ":webdav:", ORG_A_DEFAULT_PATH]);
    expect(env.RCLONE_WEBDAV_URL).toBe(`https://api.nexusgpt.io/api/dav/${SLUG}`);
    expect(env.RCLONE_WEBDAV_HEADERS).toBe("api-key,nxs_a");
    expect(argv.join(" ")).not.toContain("nxs_a");
    expect(mint).not.toHaveBeenCalled();
    expect(registry["org:org_aaa|general-context"]).toMatchObject({
      engine: "rclone",
      pid: process.pid
    });
  });

  it("on Linux a raw --api-key still has an engine: rclone, at the org-less path", async () => {
    pretendPlatform("linux");
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);
    const { out } = await runMount([SLUG]);
    expect(out).toMatchObject({
      mounted: true,
      engine: "rclone",
      mountPath: path.join(SANDBOX, "nexus", SLUG)
    });
    expect(spawned().env.RCLONE_WEBDAV_HEADERS).toBe("api-key,nxs_raw_key");
  });

  it("on Windows creates the PARENT and leaves the mount point absent — rclone there wants a non-existent leaf", async () => {
    pretendPlatform("win32");
    // The leaf exists and is empty: it is removed so rclone can create it.
    fs.mkdirSync(ORG_A_DEFAULT_PATH, { recursive: true });

    const { out } = await runMount([SLUG]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone", mountPath: ORG_A_DEFAULT_PATH });
    expect(fs.existsSync(path.dirname(ORG_A_DEFAULT_PATH))).toBe(true);
    expect(fs.existsSync(ORG_A_DEFAULT_PATH)).toBe(false);
    expect(spawned().argv.slice(0, 3)).toEqual(["mount", ":webdav:", ORG_A_DEFAULT_PATH]);
  });

  it("refuses --engine direct on Windows, naming rclone as the default there", async () => {
    pretendPlatform("win32");
    const { out } = await runMount([SLUG, "--engine", "direct"]);
    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("not available on Windows");
    expect(doc.error?.hint).toContain("rclone");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses --engine webdav off macOS, before any auth", async () => {
    pretendPlatform("linux");
    const { out } = await runMount([SLUG, "--engine", "webdav"]);
    expect((out as ErrorDocument).error?.message).toContain("macOS-only");
    expect(process.exitCode).toBe(5);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("refuses an unknown engine, listing the four accepted values, as invalid input", async () => {
    const { out } = await runMount([SLUG, "--engine", "nfs"]);
    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain('Unknown --engine "nfs"');
    expect(doc.error?.hint).toContain('"auto", "webdav", "rclone", "direct"');
    expect(doc.error?.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(process.exitCode).toBe(5);
  });

  it("labels the drive with the org name the SERVER answered, not the profile's saved copy", async () => {
    // The profile says "Acme" because that is what it was called when
    // `auth login` ran. The organization has been renamed since; nothing
    // re-reads the profile's copy, so before the mint carried a name the
    // volume, the registry row and this JSON all kept saying "Acme".
    mint.mockResolvedValue(mintedFixture({ organization: { id: "org_aaa", name: "Renamed Co" } }));

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect(out).toMatchObject({ mounted: true, orgName: "Renamed Co" });
    expect(registry["org:org_aaa|general-context"]).toMatchObject({ orgName: "Renamed Co" });
    const read = readSession(mountIdFor("org:org_aaa|general-context"));
    expect(read.ok && read.session.volumeName).toBe("General Context (Renamed Co)");
  });

  it("keeps the profile's name when the server answered none — a nameless drive is worse", async () => {
    // A hard-deleted organization yields no row, and the lookup returns absent
    // rather than a fabricated name. Falling through to the saved copy shows a
    // possibly-stale name; showing nothing would lose the org half entirely.
    mint.mockResolvedValue(mintedFixture({ organization: { id: "org_aaa", name: null } }));

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect(out).toMatchObject({ mounted: true, orgName: "Acme" });
  });

  it("defaults the mount point to ~/nexus/<org-name-slug>/<slug>, then the org id, then no org", async () => {
    // The org NAME, slugified — the profile's own org.
    const named = await runMount([SLUG, "--engine", "direct"]);
    expect(named.out).toMatchObject({ mountPath: ORG_A_DEFAULT_PATH });

    // An env override naming another org yields an id and no name.
    registry = {};
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(mintedFixture());
    process.env.NEXUS_ORGANIZATION_ID = "org_env";
    const byId = await runMount([SLUG, "--engine", "direct"]);
    expect(byId.out).toMatchObject({ mountPath: path.join(SANDBOX, "nexus", "org_env", SLUG) });

    // No organization at all: the org-less path, on the engine that allows it.
    registry = {};
    delete process.env.NEXUS_ORGANIZATION_ID;
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);
    pretendPlatform("darwin");
    const anonymous = await runMount([SLUG, "--engine", "webdav"]);
    expect(anonymous.out).toMatchObject({ mountPath: path.join(SANDBOX, "nexus", SLUG) });
  });
});

describe("nexus workspace mount --engine direct — refusals before any mint", () => {
  it("refuses a raw --api-key / NEXUS_API_KEY credential, naming the login and the way out", async () => {
    // A key that was never saved cannot be re-read by the hourly renewal.
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("needs a saved profile");
    expect(doc.error?.message).toContain("--api-key or NEXUS_API_KEY");
    expect(doc.error?.hint).toContain("nexus auth login");
    expect(doc.error?.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(registry).toEqual({});
  });

  it("refuses a profile that resolves no organization, naming auth use-org", async () => {
    resolveProfile.mockReturnValue({
      name: "org-a",
      source: "active",
      profile: { apiKey: "nxs_a", baseUrl: "https://api.nexusgpt.io" }
    } satisfies ResolvedProfile);

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("needs an organization");
    expect(doc.error?.message).toContain('profile "org-a"');
    expect(doc.error?.hint).toContain("nexus auth use-org");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses when rclone is not on PATH, naming the official download — never Homebrew", async () => {
    rcloneVersion = Object.assign(new Error("spawnSync rclone ENOENT"), { code: "ENOENT" });

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("none was found on PATH");
    expect(doc.error?.code).toBe("CLI_LOCAL_FAILED");
    expect(process.exitCode).toBe(9);
    expect(doc.error?.hint).not.toContain("brew install");
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses on macOS an rclone built without cmount (Homebrew's `go/tags: none`) — `rclone version` alone proves nothing", async () => {
    pretendPlatform("darwin");
    rcloneVersion = "rclone v1.74.4\n- go/tags: none\n";

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("cmount");
    expect(doc.error?.message).toContain("Homebrew");
    expect(process.exitCode).toBe(9);
    expect(mint).not.toHaveBeenCalled();
    // The probe ran against the binary the spawn would run.
    expect(execFileSync).toHaveBeenCalledWith("rclone", ["version"], expect.anything());
  });

  it("on Linux the build tag is not read at all: `go/tags: none` mounts, and so does a version printing no tag line", async () => {
    // Linux rclone mounts through cmd/mount, which carries no build tag, so the
    // tag list says nothing about mountability there. It must not be read: the
    // rclone engine is the Linux DEFAULT, and before this branch the whole gate
    // was "rclone version exits 0" — refusing an old build here would break a
    // plain `nexus workspace mount <slug>` for someone who opted into nothing.
    pretendPlatform("linux");
    rcloneVersion = "rclone v1.74.4\n- go/tags: none\n";
    const noTag = await runMount([SLUG, "--engine", "direct"]);
    expect(noTag.out).toMatchObject({ mounted: true, engine: "direct" });

    registry = {};
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(mintedFixture());
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    rcloneVersion = "rclone v1.74.4\n";
    const tooOldToPrintTags = await runMount([SLUG, "--engine", "direct"]);
    expect(tooOldToPrintTags.out).toMatchObject({ mounted: true, engine: "direct" });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("still refuses on macOS what Linux excuses, so the Linux arm is not a hole in the preflight", async () => {
    pretendPlatform("darwin");
    rcloneVersion = "rclone v1.74.4\n";
    const { out } = await runMount([SLUG, "--engine", "direct"]);
    expect((out as ErrorDocument).error?.message).toContain("does not report its build tags");
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses a node path the credential_process line cannot carry BEFORE any mint", async () => {
    const real = Object.getOwnPropertyDescriptor(process, "execPath");
    if (!real) throw new Error("process.execPath has no descriptor to restore");
    Object.defineProperty(process, "execPath", { ...real, value: "/opt/$HOME/bin/node" });
    try {
      const { out } = await runMount([SLUG, "--engine", "direct"]);
      const doc = out as ErrorDocument;
      expect(doc.error?.message).toContain("credential_process line cannot be written");
      expect(doc.error?.message).toContain("/opt/$HOME/bin/node");
      expect(doc.error?.code).toBe("CLI_LOCAL_FAILED");
      expect(process.exitCode).toBe(9);
      expect(mint).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(fs.existsSync(ORG_A_DEFAULT_PATH)).toBe(false);
    } finally {
      Object.defineProperty(process, "execPath", real);
    }
  });

  it("refuses on macOS when neither macFUSE nor FUSE-T is installed, and when macFUSE is not yet approved", async () => {
    pretendPlatform("darwin");
    libraries = { [FUSE_T_LIBRARY]: false, [MACFUSE_LIBRARY]: false };
    const none = await runMount([SLUG, "--engine", "direct"]);
    expect((none.out as ErrorDocument).error?.message).toContain("neither macFUSE nor FUSE-T");
    expect((none.out as ErrorDocument).error?.hint).toContain("https://rclone.org/downloads/");
    expect((none.out as ErrorDocument).error?.hint).toContain("drop --engine direct");
    expect(process.exitCode).toBe(9);

    process.exitCode = undefined;
    libraries = { [FUSE_T_LIBRARY]: false, [MACFUSE_LIBRARY]: true };
    macFuseLoader = new Error("exit 1");
    const unapproved = await runMount([SLUG, "--engine", "direct"]);
    expect((unapproved.out as ErrorDocument).error?.message).toContain("not approved");
    expect(execFileSync).toHaveBeenCalledWith(MACFUSE_LOADER, [], expect.anything());
    expect(mint).not.toHaveBeenCalled();

    // 🔴 A loader that could not RUN establishes nothing, and is not a refusal.
    // A macFUSE build that ships no `load_macfuse` at this path, or one this
    // user cannot execute, used to read as "the kernel extension is not
    // approved" — sending a caller whose macFUSE was installed AND approved to
    // Recovery mode to approve it again, with no way forward. We cannot check,
    // so we do not accuse: the mount proceeds and rclone meets the real library.
    process.exitCode = undefined;
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(mintedFixture());
    registry = {};
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    const enoent = new Error("spawnSync load_macfuse ENOENT") as Error & { code?: string };
    enoent.code = "ENOENT";
    macFuseLoader = enoent;
    const unknown = await runMount([SLUG, "--engine", "direct"]);
    expect(unknown.out).toMatchObject({ mounted: true });

    // Positive control: macFUSE present AND approved passes the preflight.
    process.exitCode = undefined;
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(mintedFixture());
    registry = {};
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    macFuseLoader = null;
    const approved = await runMount([SLUG, "--engine", "direct"]);
    expect(approved.out).toMatchObject({ mounted: true });
    expect(mint).toHaveBeenCalledTimes(1);
  });
});

describe("nexus workspace mount --engine direct — the spawn, the record, the cleanup", () => {
  it("spawns rclone on the alias with the bucket in the environment and NEVER in argv", async () => {
    const { out } = await runMount([SLUG, "--engine", "direct"]);
    expect(out).toMatchObject({ mounted: true, engine: "direct" });

    const { argv, env } = spawned();
    expect(argv.slice(0, 3)).toEqual(["mount", "nxws:", ORG_A_DEFAULT_PATH]);
    expect(argv.join(" ")).not.toContain(BUCKET);
    expect(argv[argv.indexOf("--devname") + 1]).toBe(`nexus-${SLUG}`);
    expect(argv[argv.indexOf("--volname") + 1]).toBe("General Context (Acme)");
    expect(argv).not.toContain("--allow-other");
    const mountId = (out as { mountId: string }).mountId;
    expect(mountId).toMatch(/^[0-9a-f]{16}$/);
    expect(argv[argv.indexOf("--cache-dir") + 1]).toBe(sessionPathsFor(mountId).cacheDir);
    // The positive control for the absence claim above.
    expect(env.RCLONE_CONFIG_NXWS_REMOTE).toBe(`nxs3:${BUCKET}/${SLUG}/`);
    expect(env.AWS_CONFIG_FILE).toBe(sessionPathsFor(mountId).awsConfigFile);
    expect(env.NEXUS_API_KEY).toBeUndefined();
  });

  it("records the direct row with its ids and labels, and no storage name anywhere in the row", async () => {
    const { out } = await runMount([SLUG, "--engine", "direct"]);
    const mountId = (out as { mountId: string }).mountId;

    expect(registry["org:org_aaa|general-context"]).toEqual({
      slug: SLUG,
      engine: "direct",
      mountPath: ORG_A_DEFAULT_PATH,
      baseUrl: "https://api.nexusgpt.io",
      mountId,
      access: "read-write",
      workspaceId: "ws-gc",
      pid: process.pid,
      mountedAt: expect.stringMatching(/^\d{4}-/),
      shared: false,
      readOnly: false,
      orgId: "org_aaa",
      orgName: "Acme",
      profile: "org-a"
    });
    expect(JSON.stringify(registry)).not.toMatch(/nxw-|prefix|region|not-a-secret|ASIA_/);

    // The session carries the pins the renewal acts on, and the aws.config
    // line names this process's node and entry.
    const read = readSession(mountId);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.session).toMatchObject({
      profile: "org-a",
      orgId: "org_aaa",
      baseUrl: "https://api.nexusgpt.io",
      workspace: { id: "ws-gc", slug: SLUG, shared: false },
      access: "read-write"
    });
    // The bucket, prefix and region live in rclone's environment, never in the file.
    expect(JSON.stringify(read.session)).not.toMatch(/nxw-|prefix|region/);
    const awsConfig = fs.readFileSync(sessionPathsFor(mountId).awsConfigFile, "utf-8");
    // The PATH-stable spelling of this process's node — `stableNodePath` has its
    // own cases; this pins that the line is built from it and not execPath.
    expect(awsConfig).toContain(`"${stableNodePath()}"`);
    expect(awsConfig).toContain(`workspace credential-process ${mountId}`);
  });

  it("retires a DEAD direct row whose path is reused: refuses while its cache holds unsent saves, deletes its session otherwise", async () => {
    pretendPlatform("darwin");
    const mountId = mountIdFor("org:org_aaa|general-context");
    const deadDirectRow = {
      slug: SLUG,
      engine: "direct",
      mountPath: ORG_A_DEFAULT_PATH,
      baseUrl: "https://api.nexusgpt.io",
      mountId,
      access: "read-write",
      workspaceId: "ws-gc",
      shared: false,
      readOnly: false,
      orgId: "org_aaa",
      orgName: "Acme",
      profile: "org-a",
      mountedAt: "2026-09-07T12:00:00.000Z"
    };
    registry = { "org:org_aaa|general-context": deadDirectRow };
    leaveDirtyItems(mountId, 2);

    // A WebDAV mount on the same row would never upload those two saves.
    const refused = await runMount([SLUG, "--engine", "webdav"]);
    const doc = refused.out as ErrorDocument;
    expect(doc.error?.message).toContain("2 file(s) saved to");
    expect(doc.error?.message).toContain("have not uploaded yet");
    expect(doc.error?.hint).toContain(`nexus workspace remount ${SLUG}`);
    expect(doc.error?.hint).toContain(sessionPathsFor(mountId).cacheDir);
    expect(doc.error?.code).toBe("CLI_LOCAL_FAILED");
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
    expect(registry["org:org_aaa|general-context"]).toEqual(deadDirectRow);
    expect(fs.existsSync(sessionPathsFor(mountId).cacheDir)).toBe(true);

    // A direct mount under the same id reuses the cache, and drains it.
    process.exitCode = undefined;
    const drained = await runMount([SLUG, "--engine", "direct"]);
    expect(drained.out).toMatchObject({
      mounted: true,
      engine: "direct",
      mountId,
      pendingUploads: 2
    });

    // With nothing pending, the dead row's session goes the way unmount sends it.
    registry = { "org:org_aaa|general-context": deadDirectRow };
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    fs.rmSync(sessionPathsFor(mountId).cacheDir, { recursive: true, force: true });
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    writeSession({
      version: 1,
      mountId,
      profile: "org-a",
      baseUrl: "https://api.nexusgpt.io",
      orgId: "org_aaa",
      workspace: { id: "ws-gc", slug: SLUG, shared: false },
      access: "read-write",
      volumeName: "General Context (Acme)",
      credentials: {
        accessKeyId: "ASIA_OLD",
        secretAccessKey: "not-a-secret",
        sessionToken: "not-a-token"
      },
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      mintedAt: new Date(Date.now() - 30 * 60_000).toISOString()
    });
    const replaced = await runMount([SLUG, "--engine", "webdav"]);
    expect(replaced.out).toMatchObject({ mounted: true, engine: "webdav" });
    expect(fs.existsSync(sessionPathsFor(mountId).dir)).toBe(false);
    expect(registry["org:org_aaa|general-context"]).toMatchObject({ engine: "webdav" });
  });

  it("on a fail-fast: prints the log tail with the bucket REDACTED, deletes the session, frees the mount point, records nothing", async () => {
    // rclone exits at once — a refused credential, a missing FUSE library. The
    // log it left names the bucket in its own error line.
    spawn.mockReturnValue({
      pid: 4242,
      once: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "exit") handler(1);
      }),
      unref: vi.fn()
    });
    // The log is per MOUNT, not per slug: two orgs' mounts of one slug never
    // share a file, so a tail can never show the other org's lines.
    const mountId = mountIdFor("org:org_aaa|general-context");
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(LOG_DIR, `${SLUG}-${mountId}.log`),
      `CRITICAL: Failed to create file system for "nxws:": ${BUCKET}/general-context is a file not a directory\n`
    );

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("rclone exited immediately");
    expect(message).toContain("<bucket>/general-context");
    expect(message).not.toContain(BUCKET);
    expect(process.exitCode).toBe(1);
    expect(registry).toEqual({});
    // THIS mount's session directory is gone and the empty mount point with it,
    // so the next attempt is not refused as "not empty" and no credential
    // lingers. Named by its mount id: a listing of the parent that answers []
    // whether the parent is empty or was never created proves nothing.
    expect(fs.existsSync(sessionPathsFor(mountId).dir)).toBe(false);
    expect(fs.existsSync(ORG_A_DEFAULT_PATH)).toBe(false);
  });

  it("on a fail-fast leaves a session it could not PARSE — malformed is not proof of ownership", async () => {
    // A half-written session file is exactly what a concurrent mount produces —
    // the reason the write is atomic in the first place. Reading "malformed" as
    // "mine" lets the run that LOST the race delete the winner's live
    // credential, and that drive stops renewing at its next hour. Only a
    // matching key, or a genuinely absent file, authorises the delete.
    const mountId = mountIdFor("org:org_aaa|general-context");
    spawn.mockImplementation(() => {
      fs.writeFileSync(sessionPathsFor(mountId).sessionFile, '{"version":1,"mount');
      return {
        pid: 4242,
        once: vi.fn((event: string, handler: (code: number) => void) => {
          if (event === "exit") handler(1);
        }),
        unref: vi.fn()
      };
    });

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect((out as ErrorDocument).error?.message).toContain("rclone exited immediately");
    // The torn file is STILL THERE: not parsed, not adopted, not deleted.
    expect(fs.existsSync(sessionPathsFor(mountId).sessionFile)).toBe(true);
    expect(readSession(mountId)).toEqual({ ok: false, why: "malformed" });
  });

  it("on a fail-fast leaves a session another mount wrote meanwhile — only its OWN key is cleaned up", async () => {
    // Two `mount` invocations of one workspace share a mount id. The second
    // fails on the busy mount point AFTER the first wrote its session; deleting
    // the directory here would take the first mount's key with it.
    const mountId = mountIdFor("org:org_aaa|general-context");
    const foreign = {
      version: 1 as const,
      mountId,
      profile: "org-a",
      baseUrl: "https://api.nexusgpt.io",
      orgId: "org_aaa",
      workspace: { id: "ws-gc", slug: SLUG, shared: false },
      access: "read-write" as const,
      volumeName: "General Context (Acme)",
      credentials: {
        accessKeyId: "ASIA_FIRST_MOUNT",
        secretAccessKey: "not-a-secret",
        sessionToken: "not-a-token"
      },
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      mintedAt: new Date().toISOString()
    };
    spawn.mockImplementation(() => {
      // The other mount lands its session between our write and our failure.
      writeSession(foreign);
      return {
        pid: 4242,
        once: vi.fn((event: string, handler: (code: number) => void) => {
          if (event === "exit") handler(1);
        }),
        unref: vi.fn()
      };
    });

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect((out as ErrorDocument).error?.message).toContain("rclone exited immediately");
    const kept = readSession(mountId);
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.session.credentials.accessKeyId).toBe("ASIA_FIRST_MOUNT");
  });

  it("prints the renewal and remount footer on every direct mount, and the Terminal note once per machine", async () => {
    pretendPlatform("darwin");
    const first = await runMount([SLUG, "--engine", "direct"], { json: false });
    const firstText = first.lines.join("\n");
    expect(firstText).toContain("Access renews itself about every hour");
    expect(firstText).toContain(`nexus workspace remount ${SLUG}`);
    expect(firstText).toContain("System Settings › Notifications › Terminal");
    expect(fs.existsSync(DIRECT_MOUNT_INTRO_MARKER)).toBe(true);

    registry = {};
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(mintedFixture());
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    const second = await runMount([SLUG, "--engine", "direct"], { json: false });
    const secondText = second.lines.join("\n");
    expect(secondText).toContain("Access renews itself about every hour");
    expect(secondText).not.toContain("System Settings › Notifications › Terminal");
  });
});
