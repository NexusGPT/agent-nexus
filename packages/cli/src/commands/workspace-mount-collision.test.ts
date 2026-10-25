import fs from "node:fs";
import path from "node:path";

import {
  NexusApiError,
  type WorkspaceKind,
  type WorkspaceMountCredentials
} from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stagePlatform } from "../stage-platform";

/**
 * The state directory is resolved from HOME when `../mount-registry` loads,
 * so the sandbox is set BEFORE any import — `vi.hoisted` runs ahead of them
 * wherever it sits in the file. The direct-engine cases below write real
 * session files under it; nothing here may reach the developer's own
 * `~/.nexus-mcp`.
 */
const SANDBOX = vi.hoisted(() => {
  // Joined by the host's own `path` (no import exists this early): the fs mock
  // below decides "inside the sandbox" by string prefix, against paths the
  // source builds with `path.join` — one separator, and no trailing slash.
  const dir = process
    .getBuiltinModule("node:path")
    .join(process.env.TMPDIR ?? "/tmp", `nexus-workspace-mount-collision-${process.pid}`);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import type { ResolvedProfile } from "../config";
import { LOG_DIR } from "../mount-registry";
import { setJsonMode } from "../output";
import {
  FUSE_T_LIBRARY,
  LEGACY_MACFUSE_LIBRARY,
  MACFUSE_LIBRARY,
  MACFUSE_LOADER
} from "../workspace-direct-mount/darwin/fuse-libraries";
import { managedRcloneFor } from "../workspace-direct-mount/managed-rclone";
import { awsProfileFor, mountIdFor } from "../workspace-direct-mount/mount-id";
import { mountPlatformOf } from "../workspace-direct-mount/mount-platform";
import { readSession } from "../workspace-direct-mount/read-session";
import {
  DIRECT_MOUNT_INTRO_MARKER,
  sessionPathsFor
} from "../workspace-direct-mount/session-paths";
import { stableNodePath } from "../workspace-direct-mount/stable-node-path";
import { powerShellExe, system32Exe } from "../workspace-direct-mount/win32/win32-system-exe";
import { isWinFspArch, winFspLibraryFor } from "../workspace-direct-mount/win32/winfsp-library";
import { writeSession } from "../workspace-direct-mount/write-session";
import { gatewayCacheDirFor } from "./workspace-mount/gateway-cache";
import {
  isStartScript,
  leaveStarted,
  startedRclone,
  type StartLeft
} from "./workspace-mount/win32/started-rclone";
import { HIGH_INTEGRITY_SID } from "./workspace-mount/win32/win32-elevated";

/** The managed copy's path on the host this spec runs on: a case that stages no platform probes that one. */
const MANAGED = managedRcloneFor(mountPlatformOf(process.platform));
/** The managed copy on Windows — the ONLY rclone a Windows mount runs; a case that stages win32 finds it present. */
const MANAGED_WIN = managedRcloneFor("win32");

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

// The workspace list fails unless a case names the workspaces it answers — a
// failing list degrades to the plain bare-slug mount (resolveMountTargetDetailed
// → null target), which is what most cases test.
// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
const mint = vi.fn<(slug: string, body: unknown) => Promise<WorkspaceMountCredentials>>();
type ListedWorkspace = { id: string; slug: string; isShared: boolean; kind: WorkspaceKind };
let listedWorkspaces: ListedWorkspace[] | null = null;
/** The server REFUSING the list (a 401 or 403), as opposed to the list being offline. */
let listFailure: Error | null = null;
/** The list answering that the slug is an ordinary drive — what `auto` needs before it picks direct. */
const DRIVE_LISTED: ListedWorkspace[] = [
  { id: "ws-gc", slug: "general-context", isShared: false, kind: "DRIVE" }
];
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: vi.fn(() => ({
    workspaces: {
      list: vi.fn(async () => {
        if (listFailure !== null) throw listFailure;
        if (listedWorkspaces === null) throw new Error("offline");
        return { workspaces: listedWorkspaces };
      }),
      mintMountCredentials: mint
    }
  }))
}));

// Never shell out: an empty mount table makes every webdav record read as NOT
// live; `rclone version` answers the official build's tag line unless a case
// says otherwise; the macFUSE loader succeeds unless a case makes it fail; `ps`
// (and the Windows command line) report every recorded pid as an rclone mount
// at every recorded path (`null`), so a row carrying this process's pid reads
// live.
const spawn = vi.fn();
let rcloneVersion: string | Error = "rclone v1.74.4\n- go/tags: cmount\n";
let macFuseLoader: Error | null = null;
// Drive the registry off memory instead of ~/.nexus-mcp — reads AND writes.
// Everything else under the sandbox HOME is real; a path outside it (an `--at`
// elsewhere) is created and read as empty without touching the disk.
let registry: Record<string, unknown> = {};
let psAnswer: string | Error | null = null;
/** One process per pid, as `ps -p` and WMI answer: the drive of the row that recorded it. */
function commandLineAnswer(pid: number): string {
  if (psAnswer instanceof Error) throw psAnswer;
  if (psAnswer !== null) return psAnswer;
  const row = Object.values(registry)
    .filter(isRow)
    .find((candidate) => candidate.pid === pid);
  return row === undefined ? "" : `rclone mount nxws: ${String(row.mountPath)}\n`;
}
/** A registry row as the fakes read it: any object, its fields read as unknown. */
function isRow(value: unknown): value is { readonly pid?: unknown; readonly mountPath?: unknown } {
  return typeof value === "object" && value !== null;
}
/** The pid the PowerShell command-line script asks WMI for. */
function pidInScript(script: string): number {
  return Number(/ProcessId = (\d+)/.exec(script)?.[1] ?? "NaN");
}
// Windows: WinFsp is installed unless a case says otherwise (`""` is the
// registry key absent; an Error is PowerShell itself failing to run), and the
// terminal is not elevated unless a case hands `whoami` the high-integrity SID.
// `whoami` answers ONLY at its System32 address (SystemRoot is unset in every
// case): a bare `whoami.exe` under Git Bash is coreutils, which has no `/groups`.
// The UAC policy reads UAC on, for a user who is not the built-in Administrator.
const WINFSP_DIR = "C:\\Program Files (x86)\\WinFsp";
let winFspDir: string | Error = `${WINFSP_DIR}\r\n`;
let whoamiAnswer: string = "";
const WHOAMI_EXE = "C:\\Windows\\System32\\whoami.exe";
const UAC_ON_NORMAL_ADMIN =
  "EnableLUA=1\r\nFilterAdministratorToken=\r\nUser=S-1-5-21-1111-2222-3333-1001\r\n";
let uacPolicy: string | Error = UAC_ON_NORMAL_ADMIN;
// renew.cmd's run through cmd.exe before rclone starts: the minted credentials
// document, unless a case puts something in front of it.
const RENEWAL_DOCUMENT = JSON.stringify(
  { Version: 1, AccessKeyId: "ASIA_MINTED_KEY", SecretAccessKey: "s", SessionToken: "t" },
  null,
  2
);
let renewalRunOutput = RENEWAL_DOCUMENT;
// What the Windows start (PowerShell's Start-Process) leaves behind: by default
// a live pid — this process's — and an empty log. A case stages the code rclone
// ended with inside the window, the lines it wrote first, and anything else
// that happened meanwhile.
let windowsStart: StartLeft & { readonly then?: () => void } = { pid: process.pid, log: [] };
const execFileSync = vi.fn(
  (command: string, args?: readonly string[], options?: { env?: NodeJS.ProcessEnv }) => {
    if (command === system32Exe(process.env, "cmd.exe")) return renewalRunOutput;
    if (command === "rclone" || command === MANAGED || command === MANAGED_WIN) {
      if (rcloneVersion instanceof Error) throw rcloneVersion;
      return rcloneVersion;
    }
    if (command === powerShellExe(process.env)) {
      // One reader, three scripts: the command line of a pid, the UAC policy, and WinFsp's key —
      // and the one starter: the Start-Process line that starts rclone hidden and leaves its pid in a file.
      const script = args?.[3] ?? "";
      if (isStartScript(args)) {
        // PowerShell's redirect CREATES the log (an earlier run's lines are gone), the
        // new process writes what a case staged, and the result lands in the result file.
        leaveStarted(options?.env ?? {}, windowsStart);
        windowsStart.then?.();
        return "";
      }
      // The UAC script also names Win32_Process (Explorer's owner), so it is matched first.
      if (script.includes("EnableLUA")) {
        if (uacPolicy instanceof Error) throw uacPolicy;
        return uacPolicy;
      }
      if (script.includes("Win32_Process")) return commandLineAnswer(pidInScript(script));
      if (winFspDir instanceof Error) throw winFspDir;
      return winFspDir;
    }
    if (command === WHOAMI_EXE) return whoamiAnswer;
    // Homebrew is present unless a case says otherwise; an answer of "" would
    // read as present too, so the arm is explicit rather than the fallthrough.
    if (command === "brew") return "/opt/homebrew\n";
    if (command === "ps") return commandLineAnswer(Number(args?.[4]));
    if (command === MACFUSE_LOADER && macFuseLoader !== null) throw macFuseLoader;
    return "";
  }
);
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...(args as [string])),
  execSync: vi.fn(() => ""),
  spawn: (...args: unknown[]) => spawn(...args)
}));

/**
 * Which files the preflight asks about "exist" on this Mac — FUSE-T alone by
 * default, and no managed rclone, so PATH's `rclone` is the one probed.
 */
/** The DLL rclone loads on Windows, for THIS host's CPU: the win32 cases pretend the platform, never the arch. */
const WINFSP_DLL = winFspLibraryFor(WINFSP_DIR, isWinFspArch(process.arch) ? process.arch : "x64");
const NOTHING_BUT_FUSE_T: Record<string, boolean> = {
  [FUSE_T_LIBRARY]: true,
  [MACFUSE_LIBRARY]: false,
  [LEGACY_MACFUSE_LIBRARY]: false,
  [MANAGED]: false,
  // Windows runs only the managed copy: a case that stages win32 finds it in place.
  [MANAGED_WIN]: true,
  [WINFSP_DLL]: true,
  // Linux mounts need the FUSE device; this Mac has none, and the fake falls
  // to the real disk for any path not listed here.
  "/dev/fuse": true
};
let libraries: Record<string, boolean> = { ...NOTHING_BUT_FUSE_T };
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

/** The mount id org A's row key hashes to, and the folder its rclone drive caches in. */
const ORG_A_MOUNT_ID = mountIdFor("org:org_aaa|general-context");
const ORG_A_GATEWAY_CACHE = gatewayCacheDirFor({ mountId: ORG_A_MOUNT_ID, shared: false });

/** Org A's own rclone row with no pid: a drive that died and left its cache folder. */
const ORG_A_DEAD_RCLONE_ROW = {
  slug: SLUG,
  engine: "rclone",
  mountPath: ORG_A_DEFAULT_PATH,
  baseUrl: "https://api.nexusgpt.io",
  mountId: ORG_A_MOUNT_ID,
  shared: false,
  readOnly: false,
  orgId: "org_aaa",
  orgName: "Acme",
  profile: "org-a",
  mountedAt: "2026-09-29T12:00:00.000Z"
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

/**
 * The argv and env rclone was started with — the mount itself. On macOS and
 * Linux that is the one detached `spawn`; on Windows it is the one PowerShell
 * `Start-Process` line, whose argument list is read back the way the C
 * runtime reads a command line, and whose env is PowerShell's (rclone inherits it).
 */
function spawned(): {
  exe: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  cwd: string | undefined;
} {
  const started = startedRclone(execFileSync.mock.calls, powerShellExe(process.env));
  if (process.platform === "win32") {
    // The Windows route, and only it: a detached spawn there is the console window at every renewal.
    expect(spawn).not.toHaveBeenCalled();
    expect(started).not.toBeNull();
    if (started === null) throw new Error("unreachable");
    return started;
  }
  expect(started).toBeNull();
  expect(spawn).toHaveBeenCalledTimes(1);
  const [exe, argv, options] = spawn.mock.calls[0] as [
    string,
    string[],
    { env: NodeJS.ProcessEnv; cwd?: string }
  ];
  return { exe, argv, env: options.env, cwd: options.cwd };
}

/**
 * An rclone that ends inside the fail-fast window, having written `lines` to
 * its log: on macOS and Linux the detached child exits 2 after appending them;
 * on Windows the started process leaves them in the rewritten log and its pid
 * is dead. Either way the mount reports "rclone exited immediately".
 */
function failFastWriting(
  lines: readonly string[],
  stage: { readonly meanwhile?: () => void; readonly logPath?: string } = {}
): void {
  windowsStart = { exited: 2, log: lines, then: stage.meanwhile };
  spawn.mockImplementation(() => {
    // By path, never through the fd the spawn was handed: the fs fake above knows paths.
    if (stage.logPath !== undefined) fs.appendFileSync(stage.logPath, `${lines.join("\n")}\n`);
    stage.meanwhile?.();
    return {
      pid: 4242,
      once: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "exit") handler(2);
      }),
      unref: vi.fn()
    };
  });
}

const pretendPlatform = stagePlatform();

/** Saves a previous mount left in the cache: rclone's own dirty markers under vfsMeta. */
function leaveDirtyItems(
  mountId: string,
  count: number,
  cacheDir = sessionPathsFor(mountId).cacheDir
): void {
  const metaRoot = path.join(cacheDir, "vfsMeta", "nxws{abc}", SLUG);
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
  listedWorkspaces = null;
  listFailure = null;
  resolveProfile.mockReturnValue(ORG_A_PROFILE);
  delete process.env.NEXUS_ORGANIZATION_ID;
  delete process.env.NEXUS_BASE_URL;
  // The first place the FUSE probe looks; a developer's own value would
  // otherwise answer "a FUSE library is here" through the real disk.
  delete process.env.CGOFUSE_LIBFUSE_PATH;
  registry = {};
  rcloneVersion = "rclone v1.74.4\n- go/tags: cmount\n";
  macFuseLoader = null;
  psAnswer = null;
  winFspDir = `${WINFSP_DIR}\r\n`;
  whoamiAnswer = "";
  uacPolicy = UAC_ON_NORMAL_ADMIN;
  renewalRunOutput = RENEWAL_DOCUMENT;
  windowsStart = { pid: process.pid, log: [] };
  delete process.env.SystemRoot;
  libraries = { ...NOTHING_BUT_FUSE_T };
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
    // The command line was read with the host's own reader.
    if (process.platform === "win32") {
      expect(execFileSync).toHaveBeenCalledWith(
        powerShellExe(process.env),
        expect.arrayContaining([expect.stringContaining(`ProcessId = ${String(process.pid)}`)]),
        expect.anything()
      );
    } else {
      expect(execFileSync).toHaveBeenCalledWith(
        "ps",
        ["-ww", "-o", "command=", "-p", String(process.pid)],
        expect.anything()
      );
    }
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
  it("refuses --engine rclone on macOS as retired there, naming direct (the default) and webdav, before any auth", async () => {
    pretendPlatform("darwin");
    const { out } = await runMount([SLUG, "--engine", "rclone"]);
    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("--engine rclone is retired on macOS");
    expect(doc.error?.hint).toContain("Drop --engine for direct");
    expect(doc.error?.hint).toContain('"--engine webdav", which needs nothing installed');
    expect(doc.error?.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Linux, --engine rclone is the gateway over FUSE: the key in the environment, no mint, no cmount tag needed", async () => {
    pretendPlatform("linux");
    // Linux rclone mounts without the `cmount` build tag; only macOS and
    // Windows builds need it. A Homebrew-shaped tag line must pass here.
    rcloneVersion = "rclone v1.74.4\n- go/tags: none\n";

    const { out } = await runMount([SLUG, "--engine", "rclone"]);

    // The drive keeps its VFS cache in its own folder, named by the row's
    // mount id, so status and unmount can count what has not uploaded.
    expect(out).toMatchObject({
      mounted: true,
      engine: "rclone",
      mountPath: ORG_A_DEFAULT_PATH,
      mountId: ORG_A_MOUNT_ID,
      access: null,
      pendingUploads: 0
    });
    const { argv, env, cwd } = spawned();
    expect(argv.slice(0, 3)).toEqual(["mount", ":webdav:", ORG_A_DEFAULT_PATH]);
    expect(cwd).toBeUndefined();
    expect(argv.slice(argv.indexOf("--cache-dir"), argv.indexOf("--cache-dir") + 2)).toEqual([
      "--cache-dir",
      ORG_A_GATEWAY_CACHE
    ]);
    expect(env.RCLONE_WEBDAV_URL).toBe(`https://api.nexusgpt.io/api/dav/${SLUG}`);
    expect(env.RCLONE_WEBDAV_HEADERS).toBe("api-key,nxs_a");
    expect(argv.join(" ")).not.toContain("nxs_a");
    expect(mint).not.toHaveBeenCalled();
    expect(registry["org:org_aaa|general-context"]).toMatchObject({
      engine: "rclone",
      mountId: ORG_A_MOUNT_ID,
      pid: process.pid
    });
  });

  it("on Linux, a DEAD rclone row holding unsent saves refuses a replacement that would not upload them; an rclone mount drains them", async () => {
    pretendPlatform("linux");
    registry = { "org:org_aaa|general-context": ORG_A_DEAD_RCLONE_ROW };
    leaveDirtyItems(ORG_A_MOUNT_ID, 2, ORG_A_GATEWAY_CACHE);

    // A direct mount writes its own cache; the gateway's two saves would sit unsent.
    const refused = await runMount([SLUG, "--engine", "direct"]);
    const doc = refused.out as ErrorDocument;
    expect(doc.error?.message).toContain('2 file(s) saved to "general-context"');
    expect(doc.error?.message).toContain("previous rclone mount have not uploaded yet");
    expect(doc.error?.hint).toContain(`nexus workspace remount ${SLUG}`);
    expect(doc.error?.hint).toContain(ORG_A_GATEWAY_CACHE);
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
    expect(registry["org:org_aaa|general-context"]).toEqual(ORG_A_DEAD_RCLONE_ROW);

    // The rclone engine on the same row lands on the same folder, and says what it is uploading.
    process.exitCode = undefined;
    const drained = await runMount([SLUG, "--engine", "rclone"]);
    expect(drained.out).toMatchObject({
      mounted: true,
      engine: "rclone",
      mountId: ORG_A_MOUNT_ID,
      pendingUploads: 2
    });
    expect(spawned().argv).toContain(ORG_A_GATEWAY_CACHE);

    // Nothing pending: the replaced row's empty folder goes with it.
    registry = { "org:org_aaa|general-context": ORG_A_DEAD_RCLONE_ROW };
    vi.clearAllMocks();
    spawn.mockReturnValue({ pid: process.pid, once: vi.fn(), unref: vi.fn() });
    fs.rmSync(ORG_A_GATEWAY_CACHE, { recursive: true, force: true });
    fs.mkdirSync(ORG_A_GATEWAY_CACHE, { recursive: true });
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    const replaced = await runMount([SLUG, "--engine", "direct"]);
    expect(replaced.out).toMatchObject({ mounted: true, engine: "direct" });
    expect(fs.existsSync(ORG_A_GATEWAY_CACHE)).toBe(false);
  });

  it("another scope's dead row with unsent saves on this path is refused before rclone is even probed: no plan of ours uploads them", async () => {
    pretendPlatform("linux");
    const otherId = "0123456789abcdef";
    const otherRow = {
      ...ORG_A_DEAD_RCLONE_ROW,
      engine: "direct",
      orgId: "org_bbb",
      profile: "org-b",
      mountId: otherId
    };
    registry = { "org:org_bbb|general-context": otherRow };
    leaveDirtyItems(otherId, 1);
    const refused = await runMount([SLUG, "--engine", "direct"]);
    expect((refused.out as ErrorDocument).error?.message).toContain(
      "previous direct mount have not uploaded yet"
    );
    expect(
      execFileSync.mock.calls.some(([command]) => command === "rclone" || command === MANAGED)
    ).toBe(false);
  });

  it("on Linux the admin-shared copy of a slug keeps its own folder: the org-owned copy's unsent saves refuse --shared and never count as its", async () => {
    pretendPlatform("linux");
    listedWorkspaces = [
      { id: "ws-own", slug: SLUG, isShared: false, kind: "DRIVE" },
      { id: "ws-shared", slug: SLUG, isShared: true, kind: "DRIVE" }
    ];
    // One registry key serves both copies, so one mount id: the folder is per copy.
    const ownFolder = ORG_A_GATEWAY_CACHE;
    registry = { "org:org_aaa|general-context": ORG_A_DEAD_RCLONE_ROW };
    leaveDirtyItems(ORG_A_MOUNT_ID, 1, ownFolder);

    // rclone would file the shared copy under another URL and never drain these.
    const refused = await runMount([SLUG, "--shared", "--engine", "rclone"]);
    const doc = refused.out as ErrorDocument;
    expect(doc.error?.message).toContain('1 file(s) saved to "general-context"');
    expect(doc.error?.hint).toContain(ownFolder);
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();

    // Once those are gone, the shared drive runs on its own folder.
    process.exitCode = undefined;
    fs.rmSync(ownFolder, { recursive: true, force: true });
    const shared = await runMount([SLUG, "--shared", "--engine", "rclone"]);
    expect(shared.out).toMatchObject({
      mounted: true,
      engine: "rclone",
      shared: true,
      mountId: ORG_A_MOUNT_ID
    });
    const { argv, env } = spawned();
    expect(argv).toContain(gatewayCacheDirFor({ mountId: ORG_A_MOUNT_ID, shared: true }));
    expect(env.RCLONE_WEBDAV_URL).toBe(`https://api.nexusgpt.io/api/dav/_shared/${SLUG}`);
  });

  it("on macOS the webdav engine mounts the admin-shared copy at its own gateway path", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = [{ id: "ws-shared", slug: SLUG, isShared: true, kind: "DRIVE" }];
    const { out } = await runMount([SLUG, "--shared", "--engine", "webdav"]);
    expect(out).toMatchObject({ mounted: true, engine: "webdav", shared: true });
    const mountWebdav = execFileSync.mock.calls.find(([command]) => command === "mount_webdav");
    expect(mountWebdav?.[1]).toEqual([
      `https://api.nexusgpt.io/api/dav/_t/dav-token/_shared/${SLUG}`,
      ORG_A_DEFAULT_PATH
    ]);
  });

  it('on Linux an rclone cache this CLI cannot read is "unknown" under --json, never null', async () => {
    // A POSIX-host case by its staging: `chmod 000` makes nothing unreadable on NTFS.
    pretendPlatform("linux");
    const locked = path.join(ORG_A_GATEWAY_CACHE, "vfsMeta", "locked");
    fs.mkdirSync(locked, { recursive: true });
    fs.writeFileSync(path.join(locked, "item"), '{"Dirty":true}');
    fs.chmodSync(locked, 0o000);
    try {
      const { out } = await runMount([SLUG, "--engine", "rclone"]);
      expect(out).toMatchObject({ mounted: true, engine: "rclone", pendingUploads: "unknown" });
    } finally {
      fs.chmodSync(locked, 0o700);
    }
  });

  it("on Linux a raw --api-key still has an engine: auto falls back to rclone at the org-less path, saying why", async () => {
    pretendPlatform("linux");
    listedWorkspaces = DRIVE_LISTED;
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);
    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({
      mounted: true,
      engine: "rclone",
      mountPath: path.join(SANDBOX, "nexus", SLUG)
    });
    expect(spawned().env.RCLONE_WEBDAV_HEADERS).toBe("api-key,nxs_raw_key");
    expect(warnings).toContain(
      "Mounting through the rclone engine, not direct: the API key came from --api-key or NEXUS_API_KEY"
    );
    expect(mint).not.toHaveBeenCalled();
  });

  it("auto is direct on macOS: one mint, the direct drive, no fallback line", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = DRIVE_LISTED;
    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({ mounted: true, engine: "direct" });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(spawned().argv.slice(0, 2)).toEqual(["mount", "nxws:"]);
    expect(warnings).not.toContain("not direct");
  });

  it("auto is direct on Linux: one mint, the direct drive", async () => {
    pretendPlatform("linux");
    listedWorkspaces = DRIVE_LISTED;
    const linux = await runMount([SLUG]);
    expect(linux.out).toMatchObject({ mounted: true, engine: "direct" });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  // Its own case, so a Windows host runs it: the Linux half above skips there.
  it("auto mounts direct on Windows, minting the drive's key, with no fallback line", async () => {
    pretendPlatform("win32");
    listedWorkspaces = DRIVE_LISTED;
    const windows = await runMount([SLUG]);
    expect(windows.out).toMatchObject({ mounted: true, engine: "direct" });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(windows.warnings).not.toContain("not direct");
  });

  it("auto on macOS falls back to webdav, one line each, for a raw --api-key and for FUSE the offer could not install", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = DRIVE_LISTED;
    resolveProfile.mockReturnValue(OVERRIDE_PROFILE);
    const rawKey = await runMount([SLUG]);
    expect(rawKey.out).toMatchObject({ mounted: true, engine: "webdav" });
    expect(rawKey.warnings).toContain(
      "Mounting through the webdav engine, not direct: the API key came from"
    );
    expect(mint).not.toHaveBeenCalled();

    // No FUSE layer, and no terminal to ask: direct cannot run, webdav needs nothing.
    vi.clearAllMocks();
    registry = {};
    resolveProfile.mockReturnValue(ORG_A_PROFILE);
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false };
    const noFuse = await runMount([SLUG]);
    expect(noFuse.out).toMatchObject({ mounted: true, engine: "webdav" });
    // One line: no install offer it cannot make (no terminal), and the fix named by flag.
    expect(noFuse.warnings).toContain(
      "⚠ Mounting through the webdav engine, not direct: rclone or its FUSE layer cannot be used here " +
        "(--engine direct says why and offers the fix)."
    );
    expect(noFuse.warnings).not.toContain("The CLI can install what is missing");
    expect(noFuse.warnings).not.toContain("needs a FUSE library");
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("auto mounts through the gateway when the workspace list does not answer: the kind is unknown, and no key is minted to learn it", async () => {
    pretendPlatform("darwin");
    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({ mounted: true, engine: "webdav" });
    expect(warnings).toContain(
      "Mounting through the webdav engine, not direct: the workspace list did not answer"
    );
    expect(mint).not.toHaveBeenCalled();
  });

  it("auto keeps direct when the list does not answer but a dead direct row already proves the workspace is not CODE", async () => {
    pretendPlatform("darwin");
    registry = { "org:org_aaa|general-context": { ...ORG_A_DEAD_RCLONE_ROW, engine: "direct" } };
    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({ mounted: true, engine: "direct" });
    expect(warnings).not.toContain("the workspace list did not answer");
  });

  it("on Linux auto keeps rclone for a dead rclone drive whose unsent saves only rclone uploads", async () => {
    pretendPlatform("linux");
    listedWorkspaces = DRIVE_LISTED;
    registry = { "org:org_aaa|general-context": ORG_A_DEAD_RCLONE_ROW };
    leaveDirtyItems(ORG_A_MOUNT_ID, 1, ORG_A_GATEWAY_CACHE);

    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({ mounted: true, engine: "rclone", pendingUploads: 1 });
    expect(warnings).toContain(
      "Mounting through the rclone engine, not direct: an earlier rclone mount of this drive left saves"
    );
    expect(spawned().argv).toContain(ORG_A_GATEWAY_CACHE);
    expect(mint).not.toHaveBeenCalled();
  });

  it("on Linux auto keeps rclone for saves an unmount kept in this drive's rclone folder, though no row is left", async () => {
    pretendPlatform("linux");
    listedWorkspaces = DRIVE_LISTED;
    leaveDirtyItems(ORG_A_MOUNT_ID, 1, ORG_A_GATEWAY_CACHE);

    const { out, warnings } = await runMount([SLUG]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone", pendingUploads: 1 });
    expect(warnings).toContain("an earlier rclone mount of this drive left saves");
    expect(spawned().argv).toContain(ORG_A_GATEWAY_CACHE);
    expect(mint).not.toHaveBeenCalled();
  });

  it("refuses --engine direct on a CODE workspace before it offers any install for an engine that will not mount it", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = [{ id: "ws-code", slug: SLUG, isShared: false, kind: "CODE" }];
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false };

    const { out, warnings } = await runMount([SLUG, "--engine", "direct"]);

    expect((out as ErrorDocument).error?.message).toContain("is a CODE workspace");
    expect(process.exitCode).toBe(5);
    expect(warnings).not.toContain("The CLI can install what is missing");
    expect(execFileSync).not.toHaveBeenCalledWith("brew", expect.anything(), expect.anything());
  });

  it("auto on macOS mounts a CODE workspace through webdav, read-only, saying why; --engine direct still refuses it", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = [{ id: "ws-code", slug: SLUG, isShared: false, kind: "CODE" }];
    const { out, warnings } = await runMount([SLUG]);
    expect(out).toMatchObject({
      mounted: true,
      engine: "webdav",
      readOnly: true,
      readOnlyReason: "kind"
    });
    expect(warnings).toContain(
      "Mounting through the webdav engine, not direct: it is a CODE workspace"
    );
    expect(mint).not.toHaveBeenCalled();

    vi.clearAllMocks();
    registry = {};
    const asked = await runMount([SLUG, "--engine", "direct"]);
    expect((asked.out as ErrorDocument).error?.message).toContain("is a CODE workspace");
    expect(process.exitCode).toBe(5);
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
    // rclone starts in the CLI's own log folder, never in the folder the mount was typed in.
    expect(spawned().cwd).toBe(LOG_DIR);
  });

  it("on Windows a mount that fails puts back the empty folder it removed for rclone", async () => {
    pretendPlatform("win32");
    fs.mkdirSync(ORG_A_DEFAULT_PATH, { recursive: true });
    windowsStart = { exited: 2, log: [] };

    const { out } = await runMount([SLUG]);

    expect((out as ErrorDocument).error?.message).toContain("rclone exited immediately");
    expect(fs.existsSync(ORG_A_DEFAULT_PATH)).toBe(true);
  });

  it("on Windows a folder that cannot be put back never replaces the mount's own failure", async () => {
    pretendPlatform("win32");
    fs.mkdirSync(ORG_A_DEFAULT_PATH, { recursive: true });
    windowsStart = {
      exited: 2,
      log: [],
      // A file now holds the name, so the folder cannot be created again.
      then: () => fs.writeFileSync(ORG_A_DEFAULT_PATH, "")
    };

    const { out } = await runMount([SLUG]);

    expect((out as ErrorDocument).error?.message).toContain("rclone exited immediately");
  });

  it("on Windows refuses an elevated terminal before any auth: the drive would be invisible to Explorer", async () => {
    pretendPlatform("win32");
    whoamiAnswer = `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;

    const { out } = await runMount([SLUG]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("runs as administrator");
    expect(doc.error?.hint).toContain("normal terminal");
    expect(process.exitCode).toBe(9);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Windows an administrator session with no desktop is refused with a sentence that says so, not one naming a terminal it cannot open", async () => {
    pretendPlatform("win32");
    whoamiAnswer = `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;
    uacPolicy =
      "EnableLUA=1\r\nFilterAdministratorToken=\r\nUser=S-1-5-21-1111-2222-3333-1001\r\n" +
      "Account=DESKTOP-1\\jo\r\nComputer=DESKTOP-1\r\nExplorer=\\\r\n";

    const { out } = await runMount([SLUG]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("no desktop");
    expect(doc.error?.hint).toContain("Sign in");
    expect(doc.error?.hint).not.toContain("Open a normal terminal");
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a workspace list the server refuses with 403 refuses the mount on every engine: the key is another organization's", async () => {
    pretendPlatform("darwin");
    // The SDK's shape (code, message, status); the spec's mocked class keeps none of it, so the fields are set beside.
    const message = "You are not a member of the requested organization, or it does not exist.";
    listFailure = Object.assign(new NexusApiError("ORGANIZATION_ACCESS_DENIED", message, 403), {
      status: 403,
      code: "ORGANIZATION_ACCESS_DENIED",
      message
    });

    const auto = await runMount([SLUG]);
    const refused = auto.out as ErrorDocument;
    expect(refused.error?.message).toContain("was refused (403)");
    expect(refused.error?.hint).toContain("--profile");
    expect(refused.error?.code).toBe("ORGANIZATION_ACCESS_DENIED");
    expect(process.exitCode).toBe(3);
    expect(mint).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();

    vi.clearAllMocks();
    registry = {};
    const webdav = await runMount([SLUG, "--engine", "webdav"]);
    expect((webdav.out as ErrorDocument).error?.message).toContain("was refused (403)");
    expect(process.exitCode).toBe(3);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("auto on macOS: a key request the server refuses is a clean error naming --engine webdav, and nothing is mounted for the person", async () => {
    pretendPlatform("darwin");
    listedWorkspaces = DRIVE_LISTED;
    const message = "Workspace storage is not configured on this deployment.";
    mint.mockRejectedValueOnce(
      Object.assign(new NexusApiError("WORKSPACE_STORAGE_FAILED", message, 500), {
        status: 500,
        code: "WORKSPACE_STORAGE_FAILED",
        message
      })
    );

    const { out } = await runMount([SLUG]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("refused the direct engine's key request (500)");
    expect(doc.error?.hint).toContain("--engine webdav");
    expect(doc.error?.code).toBe("WORKSPACE_STORAGE_FAILED");
    expect(process.exitCode).toBe(6);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Windows mounts from an elevated terminal when UAC is off: Explorer runs elevated too and sees the drive", async () => {
    pretendPlatform("win32");
    whoamiAnswer = `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;
    uacPolicy =
      "EnableLUA=0\r\nFilterAdministratorToken=\r\nUser=S-1-5-21-1111-2222-3333-1001\r\n" +
      "Account=DESKTOP-1\\jo\r\nComputer=DESKTOP-1\r\nExplorer=DESKTOP-1\\jo\r\n";

    const { out } = await runMount([SLUG]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone" });
  });

  it("on Windows mounts as the built-in Administrator, whom Admin Approval Mode does not filter", async () => {
    pretendPlatform("win32");
    whoamiAnswer = `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;
    uacPolicy =
      "EnableLUA=1\r\nFilterAdministratorToken=\r\nUser=S-1-5-21-1111-2222-3333-500\r\n" +
      "Account=DESKTOP-1\\Administrator\r\nComputer=DESKTOP-1\r\nExplorer=DESKTOP-1\\Administrator\r\n";

    const { out } = await runMount([SLUG]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone" });
  });

  it("on Windows keeps the elevated refusal when the UAC policy cannot be read, or filters the built-in Administrator", async () => {
    pretendPlatform("win32");
    whoamiAnswer = `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;
    uacPolicy = Object.assign(new Error("spawnSync powershell.exe ENOENT"), { code: "ENOENT" });
    expect(((await runMount([SLUG])).out as ErrorDocument).error?.message).toContain(
      "runs as administrator"
    );

    uacPolicy =
      "EnableLUA=1\r\nFilterAdministratorToken=1\r\nUser=S-1-5-21-1111-2222-3333-500\r\n" +
      "Account=DESKTOP-1\\Administrator\r\nComputer=DESKTOP-1\r\n";
    expect(((await runMount([SLUG])).out as ErrorDocument).error?.message).toContain(
      "runs as administrator"
    );

    uacPolicy =
      "EnableLUA=1\r\nFilterAdministratorToken=\r\nUser=S-1-5-21-4444-5555-6666-500\r\n" +
      "Account=CORP\\Administrator\r\nComputer=DESKTOP-1\r\n";
    expect(((await runMount([SLUG])).out as ErrorDocument).error?.message).toContain(
      "runs as administrator"
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Windows a `whoami` that cannot run reads as NOT elevated — a failed probe must not lock a user out", async () => {
    pretendPlatform("win32");
    execFileSync.mockImplementationOnce((command: string) => {
      if (command === WHOAMI_EXE) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return "";
    });

    const { out } = await runMount([SLUG]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone" });
  });

  it("on Windows refuses before the network when WinFsp is not installed: with no terminal, the flag and winpty are named", async () => {
    pretendPlatform("win32");
    winFspDir = ""; // the registry key is absent: PowerShell printed nothing

    const { out } = await runMount([SLUG]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("needs WinFsp");
    expect(doc.error?.hint).toContain("--install-deps");
    expect(doc.error?.hint).toContain("winpty nexus");
    expect(doc.error?.hint).toContain("winfsp.dev");
    expect(doc.error?.hint).toContain("administrator");
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Windows reads a WinFsp whose DLL for this CPU is missing as not installed, and a registry it could not read as fine", async () => {
    pretendPlatform("win32");
    libraries = { ...NOTHING_BUT_FUSE_T, [WINFSP_DLL]: false };
    expect(((await runMount([SLUG])).out as ErrorDocument).error?.message).toContain(
      "needs WinFsp"
    );

    registry = {};
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    libraries = { ...NOTHING_BUT_FUSE_T };
    winFspDir = Object.assign(new Error("spawnSync powershell.exe ENOENT"), { code: "ENOENT" });
    expect((await runMount([SLUG])).out).toMatchObject({ mounted: true, engine: "rclone" });
  });

  it("names an rclone the OS refused to run, with the errno, and never offers to reinstall it", async () => {
    pretendPlatform("win32");
    rcloneVersion = Object.assign(new Error("spawnSync rclone EACCES"), { code: "EACCES" });

    const { out } = await runMount([SLUG]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("refused to run it (EACCES)");
    expect(doc.error?.message).toContain("reinstalling will not help");
    // The hint names the policy, and no install: one would not lift the block.
    expect(doc.error?.hint).toContain("Allow that file in the policy that blocks it");
    expect(doc.error?.hint).not.toContain("winget install");
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Windows an OLD WinFsp line from an earlier run is gone — the start rewrites the log — so it never brings the WinFsp advice, nor shows in the tail of a later fail-fast", async () => {
    pretendPlatform("win32");
    fs.mkdirSync(LOG_DIR, { recursive: true });
    // Longer than what this run will write: a start that APPENDED would read its
    // own lines from past the old ones' end and find nothing to show.
    fs.writeFileSync(
      path.join(LOG_DIR, `${SLUG}-${ORG_A_MOUNT_ID}.log`),
      "panic: cgofuse: cannot find winfsp\n".repeat(20)
    );
    failFastWriting(["Fatal error: failed to mount FUSE fs: mountpoint X: is in use"]);

    const { out } = await runMount([SLUG]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("rclone exited immediately");
    expect(message).toContain("mountpoint X: is in use");
    expect(message).not.toContain("could not load WinFsp");
    expect(message).not.toContain("cannot find winfsp");
    expect(process.exitCode).toBe(9);
  });

  it("on Windows a fail-fast whose WinFsp line a panic trace pushed out of the tail still gets the WinFsp advice", async () => {
    pretendPlatform("win32");
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const trace = Array.from({ length: 14 }, (_, i) => `goroutine 1 [running]: frame ${String(i)}`);
    failFastWriting(["panic: cgofuse: cannot find winfsp", ...trace]);

    const { out } = await runMount([SLUG]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("rclone exited immediately");
    expect(message).toContain("could not load WinFsp");
    // The witness line is NOT in the ten-line tail: the advice read the whole log.
    expect(message.split("Recent log:")[1]?.split("Full log:")[0]).not.toContain(
      "cannot find winfsp"
    );
    expect(process.exitCode).toBe(9);
  });

  it("on Windows --at X: mounts the drive letter as given: no folder created, the volume named after the slug", async () => {
    pretendPlatform("win32");

    const { out } = await runMount([SLUG, "--at", "x:"]);

    expect(out).toMatchObject({ mounted: true, engine: "rclone", mountPath: "X:" });
    const { argv } = spawned();
    expect(argv.slice(0, 3)).toEqual(["mount", ":webdav:", "X:"]);
    expect(argv.slice(-2)).toEqual(["--volname", SLUG]);
    expect(fs.existsSync(path.join(process.cwd(), "X:"))).toBe(false);
  });

  it("on Windows refuses a drive letter a volume already holds, and --at * before any auth", async () => {
    pretendPlatform("win32");
    libraries = { ...NOTHING_BUT_FUSE_T, "Y:\\": true };
    const taken = (await runMount([SLUG, "--at", "Y:"])).out as ErrorDocument;
    expect(taken.error?.message).toContain("Drive letter Y: is in use");
    expect(spawn).not.toHaveBeenCalled();

    const star = (await runMount([SLUG, "--at", "*"])).out as ErrorDocument;
    expect(star.error?.hint).toContain("Name the letter: --at X:");
    expect(process.exitCode).toBe(5);
    expect(mint).not.toHaveBeenCalled();
  });

  it("on Windows two spellings of one folder that differ only in case are ONE mount point", async () => {
    pretendPlatform("win32");
    const upper = path.join(SANDBOX, "Nexus", "Shared");
    registry = {
      "org:org_bbb|general-context": orgBRow({
        engine: "rclone",
        pid: process.pid,
        mountPath: upper
      })
    };

    const { out } = await runMount([SLUG, "--at", upper.toLowerCase()]);

    expect((out as ErrorDocument).error?.message).toContain('org "Globex"');
    expect(spawn).not.toHaveBeenCalled();
  });

  it("on Linux the rclone engine never hands the shell's RCLONE_* or NEXUS_* to rclone", async () => {
    pretendPlatform("linux");
    process.env.RCLONE_DUMP = "headers";
    process.env.NEXUS_ADMIN_TOKEN = "admin-secret";
    try {
      await runMount([SLUG, "--engine", "rclone"]);
      const { env, argv } = spawned();
      expect(env.RCLONE_DUMP).toBeUndefined();
      expect(env.NEXUS_ADMIN_TOKEN).toBeUndefined();
      expect(env.RCLONE_WEBDAV_URL).toContain(`/api/dav/${SLUG}`);
      expect(argv).not.toContain("--volname");
    } finally {
      delete process.env.RCLONE_DUMP;
      delete process.env.NEXUS_ADMIN_TOKEN;
    }
  });

  it("on Linux the rclone engine's footer names the 100 MiB limit and --engine direct, and inside WSL no unobserved \\\\wsl$ path", async () => {
    pretendPlatform("linux");
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    try {
      const { lines } = await runMount([SLUG, "--engine", "rclone"], { json: false });
      const printed = lines.join("\n");
      expect(printed).toContain("Files over 100 MiB never finish uploading");
      expect(printed).toContain("--engine direct");
      expect(printed).not.toContain("wsl$");
    } finally {
      delete process.env.WSL_DISTRO_NAME;
    }
  });

  it("on Linux a machine with no /dev/fuse (WSL1, a container) is refused before any mint", async () => {
    pretendPlatform("linux");
    listedWorkspaces = DRIVE_LISTED;
    libraries = { ...NOTHING_BUT_FUSE_T, "/dev/fuse": false };

    const { out, warnings } = await runMount([SLUG]);

    // No --engine was typed, so the refusal names none.
    expect((out as ErrorDocument).error?.message).toContain(
      "This mount needs the FUSE device /dev/fuse"
    );
    expect(mint).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
    // auto chose direct, and the rclone engine needs the same device: no fallback
    // line, no second preflight — a second offer would ask the person twice.
    expect(warnings).not.toContain("not direct");
  });

  it("on Windows mounts --engine direct: aws.config names renew.cmd bare, renew.cmd runs the renewal, both config files are NUL", async () => {
    pretendPlatform("win32");
    const { out } = await runMount([SLUG, "--engine", "direct"]);
    expect(out).toMatchObject({ mounted: true, engine: "direct" });
    expect(mint).toHaveBeenCalledTimes(1);

    const mountId = (out as { mountId: string }).mountId;
    const paths = sessionPathsFor(mountId);
    expect(fs.readFileSync(paths.awsConfigFile, "utf-8")).toBe(
      `[profile ${awsProfileFor(mountId)}]\ncredential_process = ${paths.renewCmdFile}\n`
    );
    expect(fs.readFileSync(paths.renewCmdFile, "utf-8")).toBe(
      "@echo off\r\n" +
        '"%SystemRoot%\\System32\\chcp.com" 65001 >nul\r\n' +
        "setlocal DisableDelayedExpansion\r\n" +
        `"${stableNodePath()}" "${process.argv[1]}" workspace credential-process ${mountId}\r\n` +
        "exit /b %ERRORLEVEL%\r\n"
    );
    const { env } = spawned();
    expect(env.AWS_CONFIG_FILE).toBe(paths.awsConfigFile);
    expect(env.AWS_SHARED_CREDENTIALS_FILE).toBe("NUL");
    expect(env.RCLONE_CONFIG).toBe("NUL");
    // renew.cmd ran once, as rclone's SDK will, under the env rclone got.
    expect(execFileSync).toHaveBeenCalledWith(
      system32Exe(process.env, "cmd.exe"),
      ["/C", paths.renewCmdFile],
      expect.objectContaining({ env })
    );
  });

  it.each([
    ["aws.config", "awsConfigFile", "[profile earlier]\n"],
    ["renew.cmd", "renewCmdFile", "@echo earlier\r\n"]
  ] as const)(
    "on Windows %s is written whole or not at all: a write that dies mid-way leaves the previous file untouched",
    async (name, key, earlier) => {
      pretendPlatform("win32");
      const paths = sessionPathsFor(ORG_A_MOUNT_ID);
      fs.mkdirSync(paths.dir, { recursive: true });
      fs.writeFileSync(paths[key], earlier);
      const realWrite = fs.writeFileSync;
      let liveWhenTheWriteDied: string | null = null;
      const dying = vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
        if (!path.basename(String(file)).startsWith(name)) {
          realWrite(file, data, options);
          return;
        }
        // Half the bytes land, then the disk is full: what does the LIVE file hold now?
        realWrite(file, "PARTIAL", options);
        liveWhenTheWriteDied = fs.readFileSync(paths[key], "utf-8");
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      });
      try {
        const { out } = await runMount([SLUG, "--engine", "direct"]);
        expect((out as ErrorDocument).error?.message).toContain("ENOSPC");
      } finally {
        dying.mockRestore();
      }
      expect(liveWhenTheWriteDied).toBe(earlier);
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it("on Windows refuses --engine direct when renew.cmd does not print only the credentials (a cmd AutoRun), before rclone starts", async () => {
    pretendPlatform("win32");
    renewalRunOutput = `Active code page: 65001\r\n${RENEWAL_DOCUMENT}`;

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("hourly renewal does not run on this machine");
    expect(message).toContain("renew.cmd");
    expect(message).toContain('"Active code page: 65001"');
    expect(process.exitCode).toBe(9);
    expect(spawn).not.toHaveBeenCalled();
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
    // The way out names this platform's gateway engine by flag, never "the default".
    const gateway = process.platform === "darwin" ? "webdav" : "rclone";
    expect(doc.error?.hint).toContain(
      `Or mount with --engine ${gateway}: the gateway needs none of this.`
    );
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

  it("probes and spawns the managed rclone by its full address when one exists, whatever PATH holds", async () => {
    libraries = { ...NOTHING_BUT_FUSE_T, [MANAGED]: true };

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    expect(out).toMatchObject({ mounted: true, engine: "direct" });
    expect(execFileSync).toHaveBeenCalledWith(MANAGED, ["version"], expect.anything());
    expect(execFileSync).not.toHaveBeenCalledWith("rclone", ["version"], expect.anything());
    expect(spawned().exe).toBe(MANAGED);
  });

  it("--no-install-deps refuses a missing FUSE layer as before the offer existed, and never asks brew", async () => {
    pretendPlatform("darwin");
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false };

    const { out, warnings } = await runMount([SLUG, "--engine", "direct", "--no-install-deps"]);

    const doc = out as ErrorDocument;
    expect(doc.error?.message).toContain("neither macFUSE nor FUSE-T");
    expect(doc.error?.hint).toContain("https://rclone.org/downloads/");
    expect(process.exitCode).toBe(9);
    expect(execFileSync).not.toHaveBeenCalledWith("brew", expect.anything(), expect.anything());
    expect(warnings).not.toContain("brew install");
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

  it("refuses a node path the credential_process line cannot carry BEFORE any mint — and before offering an install", async () => {
    // FUSE is missing too: the free refusal must win over the step that may
    // download and install, or the person installs for a mount that fails anyway.
    pretendPlatform("darwin");
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false };
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

  it("on Windows refuses a node path holding a % BEFORE any mint, naming the percent sign", async () => {
    pretendPlatform("win32");
    const real = Object.getOwnPropertyDescriptor(process, "execPath");
    if (!real) throw new Error("process.execPath has no descriptor to restore");
    Object.defineProperty(process, "execPath", { ...real, value: "/opt/100%/bin/node" });
    try {
      const { out } = await runMount([SLUG, "--engine", "direct"]);
      const doc = out as ErrorDocument;
      expect(doc.error?.message).toBe(
        "The credential_process line cannot be written: the execPath /opt/100%/bin/node contains a % — cmd.exe would expand it as a variable."
      );
      expect(doc.error?.code).toBe("CLI_LOCAL_FAILED");
      expect(mint).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "execPath", real);
    }
  });

  it("refuses on macOS when neither macFUSE nor FUSE-T is installed, and when macFUSE is not yet approved", async () => {
    pretendPlatform("darwin");
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false };
    const none = await runMount([SLUG, "--engine", "direct"]);
    expect((none.out as ErrorDocument).error?.message).toContain("neither macFUSE nor FUSE-T");
    expect((none.out as ErrorDocument).error?.hint).toContain("https://rclone.org/downloads/");
    expect((none.out as ErrorDocument).error?.hint).toContain(
      "Or mount with --engine webdav: it needs nothing installed."
    );
    // No flag and no terminal is a refusal that names the flag — never an
    // install nobody confirmed.
    expect((none.out as ErrorDocument).error?.hint).toContain("No terminal to ask");
    expect(spawn).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(9);

    process.exitCode = undefined;
    libraries = { ...NOTHING_BUT_FUSE_T, [FUSE_T_LIBRARY]: false, [MACFUSE_LIBRARY]: true };
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
    // The renewal line sits in aws.config, and on Windows in the renew.cmd it names.
    const paths = sessionPathsFor(mountId);
    const renewal = fs.readFileSync(
      process.platform === "win32" ? paths.renewCmdFile : paths.awsConfigFile,
      "utf-8"
    );
    // The PATH-stable spelling of this process's node — `stableNodePath` has its
    // own cases; this pins that the line is built from it and not execPath.
    expect(renewal).toContain(`"${stableNodePath()}"`);
    expect(renewal).toContain(`workspace credential-process ${mountId}`);
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
    // log it writes during this run names the bucket in its own error line.
    // The log is per MOUNT, not per slug: two orgs' mounts of one slug never
    // share a file, so a tail can never show the other org's lines.
    const mountId = mountIdFor("org:org_aaa|general-context");
    fs.mkdirSync(LOG_DIR, { recursive: true });
    failFastWriting(
      [
        `CRITICAL: Failed to create file system for "nxws:": ${BUCKET}/general-context is a file not a directory`
      ],
      { logPath: path.join(LOG_DIR, `${SLUG}-${mountId}.log`) }
    );

    const { out } = await runMount([SLUG, "--engine", "direct"]);

    const message = (out as ErrorDocument).error?.message ?? "";
    expect(message).toContain("rclone exited immediately");
    expect(message).toContain(`Full log: ${path.join(LOG_DIR, `${SLUG}-${mountId}.log`)}`);
    expect(message).toContain("<bucket>/general-context");
    expect(message).not.toContain(BUCKET);
    // A local failure, like every other refusal of this mount: 9, never the
    // "unknown" 1 a bare Error would earn.
    expect(process.exitCode).toBe(9);
    expect(registry).toEqual({});
    // THIS mount's session directory is gone and the empty mount point with it,
    // so the next attempt is not refused as "not empty" and no credential
    // lingers. Named by its mount id: a listing of the parent that answers []
    // whether the parent is empty or was never created proves nothing.
    expect(fs.existsSync(sessionPathsFor(mountId).dir)).toBe(false);
    expect(fs.existsSync(ORG_A_DEFAULT_PATH)).toBe(false);
  });

  it("on a fail-fast over FUSE-T: the next steps in order, macFUSE named as the manual fallback — and not when macFUSE ran", async () => {
    pretendPlatform("darwin");
    const failsFast = () =>
      spawn.mockReturnValue({
        pid: 4242,
        once: vi.fn((event: string, handler: (code: number) => void) => {
          if (event === "exit") handler(1);
        }),
        unref: vi.fn()
      });
    failsFast();
    const onFuseT = (await runMount([SLUG, "--engine", "direct"])).out as ErrorDocument;
    const advice = onFuseT.error?.message ?? "";
    expect(advice).toContain("FUSE-T did not mount");
    expect(advice.indexOf("Network Volumes")).toBeLessThan(advice.indexOf("macfuse.github.io"));
    // Direct is the default engine, so the way out names webdav by flag.
    expect(advice).toContain(
      "Or mount it again with --engine webdav — it needs nothing installed."
    );
    expect(advice).not.toContain("drop --engine direct");
    expect(advice).not.toContain("brew install");

    registry = {};
    fs.rmSync(ORG_A_DEFAULT_PATH, { recursive: true, force: true });
    mint.mockResolvedValue(mintedFixture());
    libraries = { ...NOTHING_BUT_FUSE_T, [MACFUSE_LIBRARY]: true };
    failsFast();
    const onMacFuse = (await runMount([SLUG, "--engine", "direct"])).out as ErrorDocument;
    expect(onMacFuse.error?.message).toContain("rclone exited immediately");
    expect(onMacFuse.error?.message).not.toContain("FUSE-T did not mount");
  });

  it("on a fail-fast leaves a session it could not PARSE — malformed is not proof of ownership", async () => {
    // A half-written session file is exactly what a concurrent mount produces —
    // the reason the write is atomic in the first place. Reading "malformed" as
    // "mine" lets the run that LOST the race delete the winner's live
    // credential, and that drive stops renewing at its next hour. Only a
    // matching key, or a genuinely absent file, authorises the delete.
    const mountId = mountIdFor("org:org_aaa|general-context");
    failFastWriting([], {
      meanwhile: () => fs.writeFileSync(sessionPathsFor(mountId).sessionFile, '{"version":1,"mount')
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
    // The other mount lands its session between our write and our failure.
    failFastWriting([], { meanwhile: () => writeSession(foreign) });

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
