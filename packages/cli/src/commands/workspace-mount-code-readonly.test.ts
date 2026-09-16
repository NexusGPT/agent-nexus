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
  const dir = `${tmp}/nexus-workspace-mount-kind-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { ResolvedProfile } from "../config";
import { setJsonMode } from "../output";
import { FUSE_T_LIBRARY, MACFUSE_LIBRARY } from "../workspace-direct-mount";

/**
 * NEX-3872: a CODE workspace mounted READ-WRITE, then refused on every write.
 *
 * `WorkspaceKind` is `DRIVE | CODE`, and CODE is a read-only projection of a
 * git project — the WebDAV gateway answers 403 to every PUT, DELETE, MKCOL and
 * MOVE against one (`KIND_IS_READ_ONLY`, `workspace.entity.ts`). The mount path
 * never read that field: `resolveMountTarget` annotated the list rows
 * `{ id, slug, isShared }`, and the SDK's own `Workspace` interface omitted
 * `kind` too, so the field was on the wire and invisible to every compiler
 * between it and the user.
 *
 * What that cost: the mount succeeded, `workspace status` printed `Mode rw`,
 * and the first save came back as a bare "Permission denied" naming no
 * workspace and no reason. Under a local write cache it is worse than a
 * refusal — the write is buffered and fails on flush, so the editor reports a
 * SUCCESSFUL save and the bytes are dropped. That is why the direct engine
 * refuses the kind outright rather than mounting it read-only.
 *
 * ## What each test here would have caught, and what none of them can
 *
 * These drive the real `mount` action and the real `status` action over an
 * in-memory registry, so they cover mount mode → registry row → `Mode` column
 * as ONE chain. They do NOT reach the gateway: that the server actually
 * refuses a CODE write is pinned backend-side in
 * `webdav-gateway.service.spec.ts` and `webdav-gateway.role-narrowing.spec.ts`,
 * and this file deliberately does not restate it — a second copy of that claim
 * would be a second thing to drift.
 */

// Hermetic error taxonomy: `handleError` narrows over the SDK's error classes.
// `WorkspaceKind` is a TYPE, so it is erased and needs no factory here.
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

/** The workspace list the mount resolves its target from — set per test. */
let listed: { id: string; slug: string; isShared: boolean; kind: string }[] = [];
let listFails = false;
/** The direct engine's one mint, and what it answers. */
const mint = vi.fn<(slug: string, body: unknown) => Promise<WorkspaceMountCredentials>>();
// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: vi.fn(() => ({
    workspaces: {
      list: vi.fn(async () => {
        if (listFails) throw new Error("offline");
        return { workspaces: listed };
      }),
      mintMountCredentials: mint
    }
  }))
}));

// Never shell out. `mount_webdav` succeeds silently; the mount table lists
// whatever `mountTable` holds, so a webdav row can read live; `rclone version`
// answers the official build's tag line unless a case says otherwise.
const spawn = vi.fn();
let mountTable = "";
let rcloneVersion = "rclone v1.74.4\n- go/tags: cmount\n";
const execFileSync = vi.fn((command: string, _args?: readonly string[]) => {
  if (command === "mount") return mountTable;
  if (command === "rclone") return rcloneVersion;
  // Every recorded pid reads as an rclone mount, so a direct row is live.
  if (command === "ps") return "rclone mount nxws: /Users/me/nexus/acme/docs\n";
  return "";
});
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...(args as [string, readonly string[]])),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes, so
// `status` below reads exactly what `mount` wrote. Everything else under the
// sandbox HOME is real; a path outside it (an `--at` elsewhere) is created and
// read as empty without touching the disk.
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
      // FUSE-T is the library "installed" here: no kernel extension, so no
      // loader is run and the preflight passes on every platform.
      existsSync: vi.fn((p: string) => {
        if (p === FUSE_T_LIBRARY) return true;
        if (p === MACFUSE_LIBRARY) return false;
        return actual.existsSync(p);
      }),
      openSync: vi.fn(() => 1)
    }
  };
});

const resolveProfile = vi.fn();
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, resolveProfile: (...args: unknown[]) => resolveProfile(...args) };
});

import { registerWorkspaceCommands } from "./workspace";

const PROFILE: ResolvedProfile = {
  name: "org-a",
  source: "active",
  profile: {
    apiKey: "nxs_a",
    baseUrl: "https://api.nexusgpt.io",
    orgId: "org_aaa",
    orgName: "Acme"
  }
};

function mintedFixture(over: Partial<WorkspaceMountCredentials> = {}): WorkspaceMountCredentials {
  return {
    workspace: { id: "drive-id", slug: "docs", name: "Docs", kind: "DRIVE", isShared: false },
    organization: { id: "org_aaa", name: "Acme" },
    access: "read-write",
    storage: { bucket: "nxw-d-0123456789ab", prefix: "docs/", region: "eu-west-3" },
    credentials: {
      accessKeyId: "ASIA_MINTED_KEY",
      secretAccessKey: "not-a-secret",
      sessionToken: "not-a-token"
    },
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...over
  };
}

async function run(...argv: string[]): Promise<{ out: unknown; lines: string }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  setJsonMode(true);
  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    chunks.push(a.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  }
  const text = chunks.join("\n");
  return { out: JSON.parse(text), lines: text };
}

/** The argv `mount_webdav` was actually run with — the only proof of the mount mode. */
function webdavArgs(): string[] {
  const calls = execFileSync.mock.calls.filter(([command]) => command === "mount_webdav");
  expect(calls).toHaveLength(1);
  return [...(calls[0][1] ?? [])];
}

/** The argv rclone was actually spawned with — the only proof of the mount mode. */
function rcloneArgs(): string[] {
  expect(spawn).toHaveBeenCalledTimes(1);
  return spawn.mock.calls[0][1] as string[];
}

/**
 * `process.platform` is a configurable, non-writable data property, so it is
 * redefined rather than assigned — and restored to its real descriptor after
 * each case, because a leaked fake platform would corrupt every later file in
 * the run rather than fail this one. The WebDAV engine is macOS-only, and its
 * mount is stubbed here, so the cases below run the same on every CI runner.
 */
const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");
function pretendDarwin(): void {
  if (!REAL_PLATFORM) throw new Error("process.platform has no descriptor to restore");
  Object.defineProperty(process, "platform", { ...REAL_PLATFORM, value: "darwin" });
}
function pretendLinux(): void {
  if (!REAL_PLATFORM) throw new Error("process.platform has no descriptor to restore");
  Object.defineProperty(process, "platform", { ...REAL_PLATFORM, value: "linux" });
}
function restorePlatform(): void {
  if (REAL_PLATFORM) Object.defineProperty(process, "platform", REAL_PLATFORM);
}

const MOUNT_TABLE_LIVE = (mountPath: string): string => `nexus on ${mountPath} (webdav)`;

beforeEach(() => {
  vi.clearAllMocks();
  resolveProfile.mockReturnValue(PROFILE);
  delete process.env.NEXUS_ORGANIZATION_ID;
  delete process.env.NEXUS_BASE_URL;
  registry = {};
  listed = [];
  listFails = false;
  mountTable = "";
  rcloneVersion = "rclone v1.74.4\n- go/tags: cmount\n";
  process.exitCode = undefined;
  spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
  mint.mockReset();
  mint.mockResolvedValue(mintedFixture());
  // The WebDAV engine mints its mount token over a raw `fetch`; nothing here
  // may reach a network.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "dav-token" })));
  fs.rmSync(path.join(SANDBOX, "nexus"), { recursive: true, force: true });
  fs.rmSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  restorePlatform();
  setJsonMode(false);
  process.exitCode = undefined;
});
afterAll(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

// 🚨 THE WEBDAV MOUNT IS RECORDED LIVE BY THE MOUNT TABLE THE CASES STUB, so the
// row `status` reads is not a dead one: `workspace status` REFUSES on a dead
// mount, and under --json the refusal replaces the rows the assertions below
// read. Nothing in this file is about liveness — it is about the recorded MODE
// — so the fixture is made live rather than the assertions weakened.
describe("nexus workspace mount — a CODE workspace is mounted read-only (WebDAV engine)", () => {
  beforeEach(() => {
    pretendDarwin();
  });

  it("passes -o ro to mount_webdav for a CODE workspace, with no flag from the user", async () => {
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];

    const { out } = await run("mount", "app-src", "--engine", "webdav");

    // The argv is the mount. Everything else this test asserts is bookkeeping
    // ABOUT the mount; this is the mount itself.
    expect(webdavArgs().slice(0, 2)).toEqual(["-o", "ro"]);
    expect(out).toMatchObject({
      mounted: true,
      readOnly: true,
      readOnlyReason: "kind",
      storageKind: "CODE"
    });
  });

  it("does NOT pass -o ro for a DRIVE workspace — the control", async () => {
    // Without this arm every assertion above is satisfied by a mount that is
    // read-only unconditionally, which would be a different bug of the same size.
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];

    const { out } = await run("mount", "docs", "--engine", "webdav");

    expect(webdavArgs()).not.toContain("ro");
    expect(out).toMatchObject({
      mounted: true,
      readOnly: false,
      readOnlyReason: null,
      storageKind: "DRIVE"
    });
  });

  it("records the EFFECTIVE mode, so `workspace status` prints Mode ro", async () => {
    // The whole chain in one test: `status` reads the registry and nothing else,
    // so recording the user's FLAG rather than the effective mode is exactly
    // what made it print `Mode rw` over a drive that refuses every write.
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];
    const mounted = (await run("mount", "app-src", "--engine", "webdav")).out as {
      mountPath: string;
    };
    mountTable = MOUNT_TABLE_LIVE(mounted.mountPath);

    const { out } = await run("status");
    const rows = out as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "app-src", mode: "ro" });
  });

  it("still prints Mode rw for a DRIVE workspace — the status control", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];
    const mounted = (await run("mount", "docs", "--engine", "webdav")).out as {
      mountPath: string;
    };
    mountTable = MOUNT_TABLE_LIVE(mounted.mountPath);

    const rows = (await run("status")).out as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ slug: "docs", mode: "rw" });
  });

  it("keeps --read-only working on a DRIVE workspace, reported as requested", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];

    const { out } = await run("mount", "docs", "--engine", "webdav", "--read-only");

    expect(webdavArgs().slice(0, 2)).toEqual(["-o", "ro"]);
    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "requested" });
  });

  it("reports the kind as the reason when BOTH apply, because kind cannot be waived", async () => {
    // `--read-only` on a CODE workspace is redundant, not wrong. The reason
    // reported is the one the user cannot turn off, so a script reading it
    // learns the mode is not theirs to change.
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];

    const { out } = await run("mount", "app-src", "--engine", "webdav", "--read-only");

    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "kind" });
  });

  it("mounts the CHOSEN copy's kind on a slug collision, not the other copy's", async () => {
    // Same slug, different kinds: the bare slug takes the org-owned CODE copy,
    // `--shared` takes the admin-shared DRIVE one. Reading the kind off the
    // wrong copy passes every single-copy test above.
    listed = [
      { id: "org-code", slug: "tools", isShared: false, kind: "CODE" },
      { id: "shared-drive", slug: "tools", isShared: true, kind: "DRIVE" }
    ];

    const bare = await run("mount", "tools", "--engine", "webdav");
    expect(webdavArgs().slice(0, 2)).toEqual(["-o", "ro"]);
    expect(bare.out).toMatchObject({ readOnly: true, storageKind: "CODE" });

    execFileSync.mockClear();
    registry = {};

    const shared = await run("mount", "tools", "--engine", "webdav", "--shared", "--at", "/tmp/x");
    expect(webdavArgs()).not.toContain("ro");
    expect(shared.out).toMatchObject({ readOnly: false, storageKind: "DRIVE" });
  });

  it("falls back to read-write when the list cannot be fetched, and says the kind is unknown", async () => {
    // ⚠️ UNKNOWN IS NOT WRITABLE. The server still refuses the writes; all that
    // is lost is the warning. Asserting the degraded shape here is what stops
    // someone "simplifying" the absent case into a read-only default, which
    // would make every DRIVE mount read-only the moment the API blips.
    listFails = true;

    const { out } = await run("mount", "app-src", "--engine", "webdav");

    expect(webdavArgs()).not.toContain("ro");
    expect(out).toMatchObject({ readOnly: false, readOnlyReason: null, storageKind: null });
  });
});

// ── The direct engine ─────────────────────────────────────────────────────────
//
// A local write cache turns a refused write into a LOST one: the save succeeds
// and the upload is dropped. So the direct engine does not mount a CODE
// workspace read-only — it refuses it, before Nexus is asked for anything —
// and it lets the SERVER's grade, not the local flag alone, decide the mode.

describe("nexus workspace mount --engine direct — kind and grade", () => {
  it("refuses a CODE workspace outright, before any mint, naming the default engine", async () => {
    listed = [{ id: "code-id", slug: "app-src", isShared: false, kind: "CODE" }];

    const { out } = (await run("mount", "app-src", "--engine", "direct")) as {
      out: { error?: { message?: string; hint?: string; code?: string } };
    };

    const message = out.error?.message ?? "";
    expect(message).toContain('"app-src" is a CODE workspace');
    expect(message).toContain("drop them at upload");
    expect(out.error?.hint).toContain("Drop --engine direct");
    expect(out.error?.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(process.exitCode).toBe(5);
    // Nothing minted, nothing spawned, nothing recorded.
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(registry).toEqual({});
  });

  it("refuses a CODE workspace the MINT reveals when the list could not be fetched, and cleans up", async () => {
    // The list is the cheap gate; the mint's own answer is the authoritative
    // one, and it is checked too — otherwise an offline list would let a CODE
    // drive come up read-write under a cache that drops every save.
    listFails = true;
    mint.mockResolvedValue(
      mintedFixture({
        workspace: { id: "code-id", slug: "app-src", name: "App", kind: "CODE", isShared: false },
        access: "read"
      })
    );

    const { out } = (await run("mount", "app-src", "--engine", "direct")) as {
      out: { error?: { message?: string } };
    };

    expect(out.error?.message).toContain('"app-src" is a CODE workspace');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(registry).toEqual({});
    expect(fs.existsSync(path.join(SANDBOX, ".nexus-mcp", "mount-credentials"))).toBe(false);
  });

  it("mounts a DRIVE workspace read-write when the server grants it, with no --read-only in argv", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];

    const { out } = await run("mount", "docs", "--engine", "direct");

    expect(rcloneArgs()).not.toContain("--read-only");
    expect(mint).toHaveBeenCalledWith("docs", { access: "read-write" });
    expect(out).toMatchObject({
      mounted: true,
      engine: "direct",
      readOnly: false,
      readOnlyReason: null,
      access: "read-write"
    });
  });

  it("passes --read-only on the GATEWAY rclone engine too — the Linux and Windows default", async () => {
    // 🔴 A HOLE THIS BRANCH OPENED. `mountRclone` has its own argv builder, and
    // its `--read-only` push is a different line from `directMountArgv`'s. The
    // cases around this one all drive `--engine direct`, so deleting that push
    // left every one of them green while a CODE workspace mounted READ-WRITE on
    // Linux and Windows — where, under `--vfs-cache-mode writes`, an editor
    // reports a successful save and the bytes are dropped at flush.
    pretendLinux();
    try {
      listed = [{ id: "code-id", slug: "docs", isShared: false, kind: "CODE" }];

      const { out } = await run("mount", "docs", "--engine", "rclone");

      expect(rcloneArgs()).toContain("--read-only");
      expect(out).toMatchObject({ mounted: true, engine: "rclone", readOnly: true });
    } finally {
      restorePlatform();
    }
  });

  it("asks for read and passes --read-only when the user asks for it", async () => {
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];
    mint.mockResolvedValue(mintedFixture({ access: "read" }));

    const { out } = await run("mount", "docs", "--engine", "direct", "--read-only");

    expect(rcloneArgs()).toContain("--read-only");
    expect(mint).toHaveBeenCalledWith("docs", { access: "read" });
    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "requested", access: "read" });
  });

  it("forces --read-only and reports the grade when a read-write request is GRANTED read", async () => {
    // The scope, the kind, or a shared library without a write grant: Nexus
    // answers `read` to a read-write request, and the drive must not accept
    // saves it would drop.
    listed = [{ id: "drive-id", slug: "docs", isShared: false, kind: "DRIVE" }];
    mint.mockResolvedValue(mintedFixture({ access: "read" }));

    const { out } = await run("mount", "docs", "--engine", "direct");

    expect(rcloneArgs()).toContain("--read-only");
    expect(mint).toHaveBeenCalledWith("docs", { access: "read-write" });
    expect(out).toMatchObject({ readOnly: true, readOnlyReason: "granted", access: "read" });
    // The row keeps the REQUEST and the GRANT apart: `remount` asks for the
    // request again, `status` reads the two together as Mode ro.
    expect(registry["org:org_aaa|docs"]).toMatchObject({ readOnly: false, access: "read" });
  });

  it("names the shared copy by id in the mint only when the shared copy is the target", async () => {
    listed = [
      { id: "org-drive", slug: "tools", isShared: false, kind: "DRIVE" },
      { id: "shared-drive", slug: "tools", isShared: true, kind: "DRIVE" }
    ];
    mint.mockResolvedValue(
      mintedFixture({
        workspace: {
          id: "shared-drive",
          slug: "tools",
          name: "Tools",
          kind: "DRIVE",
          isShared: true
        }
      })
    );

    await run("mount", "tools", "--engine", "direct", "--shared");
    expect(mint).toHaveBeenCalledWith("tools", {
      workspaceId: "shared-drive",
      access: "read-write"
    });

    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    mint.mockResolvedValue(
      mintedFixture({
        workspace: { id: "org-drive", slug: "tools", name: "Tools", kind: "DRIVE", isShared: false }
      })
    );
    registry = {};
    fs.rmSync(path.join(SANDBOX, "nexus"), { recursive: true, force: true });

    await run("mount", "tools", "--engine", "direct");
    expect(mint).toHaveBeenCalledWith("tools", { access: "read-write" });
  });
});
