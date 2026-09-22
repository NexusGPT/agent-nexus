import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { createClient } from "../client";
import {
  resolveBaseUrl,
  type ResolvedProfile,
  resolveOrganization,
  resolveProfile
} from "../config";
import { failure, invalidInput } from "../errors";
import {
  type Engine,
  ENGINE_LIVENESS,
  ENGINES,
  ensureStateSubdir,
  LOG_DIR,
  type MountRecord,
  type MountScope,
  type RcloneEngine
} from "../mount-registry";
import { color, printWarning } from "../output";
import {
  describePendingUploads,
  FUSE_T_LIBRARY,
  MACFUSE_LIBRARY,
  MACFUSE_LOADER,
  PENDING_UPLOADS_UNKNOWN,
  preflightProblemMessage,
  rcloneBuildVerdict,
  rcloneInstallHint,
  type RclonePreflightProblem,
  redactBucketNames
} from "../workspace-direct-mount";
import type { DirectPlan } from "./workspace-mount-direct";
import type { GatewayEngine } from "./workspace-mount-gateway";

// ── Mount engines ─────────────────────────────────────────────────────────────
//
// Three engines mount a workspace, and they differ in WHO holds the credential:
//   - webdav → macOS `mount_webdav` against the Nexus WebDAV gateway. Nothing to
//              install, no kernel extension, and the server authorises every
//              request, so a revoked key stops the drive at once. macOS-only,
//              and the default there.
//   - rclone → rclone mounting the same gateway over FUSE, the API key in its
//              environment. Server-authorised like webdav, and it works with a
//              raw --api-key. The default on Linux (FUSE is in-kernel) and
//              Windows (WinFsp); retired on macOS, where webdav and direct cover
//              everything it did.
//   - direct → rclone signing S3 requests itself with a one-hour credential the
//              CLI mints from the API key and renews through
//              `credential-process`. Fast (rclone's VFS cache), opt-in
//              everywhere: macFUSE or FUSE-T on macOS, FUSE on Linux. Not on
//              Windows — its renewal hook runs through a POSIX shell.
//
// This module is what the engines and the verbs share. The engines are
// `workspace-mount-gateway.ts` (webdav, rclone) and `workspace-mount-direct.ts`;
// the four drive verbs are `workspace-mount.ts`, `workspace-remount.ts`,
// `workspace-unmount.ts` and `workspace-status.ts`; the CRUD verbs and the
// namespace are in `workspace.ts`.

export function isEngine(value: string): value is Engine {
  return ENGINES.some((engine) => engine === value);
}

/**
 * What `mount` settled before its first network call, by engine. A gateway
 * plan carries nothing but the engine; a direct plan carries the mount id, the
 * pins and the accepted credential_process line, so a consumer that reads
 * `mountId` has to prove the engine is `direct` first.
 */
export type MountPlan =
  | { readonly engine: GatewayEngine }
  | ({ readonly engine: "direct" } & DirectPlan);

/**
 * Where each engine runs, and what to say when it does not. One row per engine:
 * `runsOn` is the platform test; `why` is the refusal `remount` shows; `mountWhy`
 * and `mountFix` are the longer pair `mount` shows, because `mount` can type a
 * flag and `remount` cannot. A new engine does not compile until it has a row.
 */
type PlatformRule = {
  readonly runsOn: (platform: NodeJS.Platform) => boolean;
  readonly why: string;
  readonly mountWhy: string;
  readonly mountFix: string;
};

const PLATFORM_RULES = {
  webdav: {
    runsOn: (platform) => platform === "darwin",
    why: "The native WebDAV engine is macOS-only.",
    mountWhy: "The native WebDAV engine is macOS-only.",
    mountFix:
      "Drop --engine: rclone (the same gateway, over FUSE) is the default on Linux and Windows."
  },
  rclone: {
    runsOn: (platform) => platform !== "darwin",
    why: "--engine rclone is retired on macOS.",
    mountWhy:
      "--engine rclone is retired on macOS: the WebDAV default and --engine direct cover everything it did.",
    mountFix:
      'Use "--engine direct" (fast; needs macFUSE or FUSE-T) or drop --engine for the WebDAV default.'
  },
  direct: {
    runsOn: (platform) => platform !== "win32",
    why: "--engine direct is not available on Windows yet.",
    mountWhy:
      "--engine direct is not available on Windows yet: its hourly renewal hook runs through a POSIX shell.",
    mountFix: "Drop --engine: rclone (the Nexus gateway over FUSE) is the default on Windows."
  }
} satisfies Record<Engine, PlatformRule>;

/**
 * The engines each platform can run. Asked for before any auth by `mount`, and
 * again by `remount` on the engine a row recorded — a row written on one
 * machine can be replayed on another. Both callers read `PLATFORM_RULES`.
 */
export function refuseEngineOffPlatform(
  engine: Engine,
  caller: "mount" | "remount" = "mount"
): void {
  const rule = PLATFORM_RULES[engine];
  if (rule.runsOn(process.platform)) return;
  // 🔴 `remount` takes NO `--engine` and no `--read-only`: it replays the engine
  // the registry row recorded. `mountFix` names a flag, so on `remount` it is an
  // instruction the caller cannot type, on a row they cannot otherwise move. The
  // way out is the pair that CAN change an engine.
  if (caller === "remount") {
    throw invalidInput(
      `${rule.why} This drive's row recorded it, and remount replays the recorded engine.`,
      `Run: nexus workspace unmount <slug>, then nexus workspace mount <slug> --engine <one this platform runs>.`
    );
  }
  throw invalidInput(rule.mountWhy, rule.mountFix);
}

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────
// The registry record/IO lives in ../mount-registry, org-scoped per NEX-2360:
// keys are `<kind>:<acting-org>|<slug>` — the kind tag (`org:`/`profile:`/`url:`)
// keeps a profile named after an org id out of that org's key space — and each
// record pins the org/profile + ro/rw mode it was mounted with (NEX-2372).
// Legacy bare-slug records stay readable.

/** True if a PID is a live process we can signal. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True if `mountPath` is currently an active mount point (used for native mounts). */
function isMountPoint(mountPath: string): boolean {
  // macOS lists the realpath in the mount table (e.g. /tmp → /private/tmp), so
  // compare against the resolved path — otherwise a live native mount under a
  // symlinked dir reads as "not mounted" (wrong `status`, bypassed re-mount
  // guard). Fall back to the raw path if it can't be resolved (e.g. unmounted).
  let resolved = mountPath;
  try {
    resolved = fs.realpathSync(mountPath);
  } catch {
    /* keep the raw path */
  }
  try {
    const out = execFileSync("mount", [], { encoding: "utf-8" });
    return out
      .split("\n")
      .some((line) => line.includes(` on ${resolved} `) || line.includes(` on ${mountPath} `));
  } catch {
    return false;
  }
}

/**
 * True when the pid a row recorded is alive AND still an `rclone mount`. A pid
 * is reused after the mount dies, so the bare signal check alone would report a
 * stranger as the drive — and `unmount` would then kill it. The command line is
 * read from `ps`, which every POSIX platform has.
 *
 * debt: a reused pid whose command line happens to name both words (another
 *       rclone mount, an editor open on `rclone-mount.md`) still passes;
 *       compare the mount path too once `ps` output is observed on both Linux
 *       and macOS for a path with spaces.
 */
export function isRecordedRcloneProcess(record: MountRecord): boolean {
  if (typeof record.pid !== "number" || !isAlive(record.pid)) return false;
  // debt: no command-line check on Windows (`tasklist /v` is the probe); add it
  //       once a Windows mount is observed at all.
  if (process.platform === "win32") return true;
  let command: string;
  try {
    command = execFileSync("ps", ["-o", "command=", "-p", String(record.pid)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    // 🚨 FAIL OPEN. "I could not read it" is not "it is not running", and the
    // two answers have opposite consequences here: a row read as dead is
    // detached (`fusermount -u`) and its registry entry reclaimed, which on a
    // LIVE `--vfs-cache-mode writes` drive discards whatever has not uploaded.
    // `ps` is absent or option-incompatible on a stripped container image
    // (busybox, distroless), so the throw is a real state, not a corner. The
    // signal check above already proved a process is there; keep the pre-branch
    // behaviour of trusting it rather than inventing a death.
    return true;
  }
  return command.includes("rclone") && command.includes("mount");
}

/** Liveness of a recorded mount, by the probe its engine declares. */
export function isMountLive(record: MountRecord): boolean {
  if (ENGINE_LIVENESS[record.engine] === "pid") return isRecordedRcloneProcess(record);
  return isMountPoint(record.mountPath);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The acting org for a resolved credential — the org the server will serve for
 * it. Resolved through `resolveOrganization`, the SAME function `createClient`,
 * `mcp-rpc` and `tenant-http` send the `organization-id` header from, so a mount
 * cannot be recorded against one organization while the API calls that fill it
 * go to another (NEX-2474). Post NEX-3175 a mismatched override 403s
 * server-side instead of silently answering from another org, so this
 * resolution is deterministic at mount time; the registry pins it and `auth
 * use-org` switches later never retarget an existing mount.
 *
 * This used to re-implement the precedence by hand as the env var falling back
 * to the profile's `orgId` (NEX-4621). It agreed with the canon at the time,
 * which is exactly why nothing would have reported the day it stopped: a second
 * copy of a selection rule does not fail, it picks a different tenant.
 *
 * The org NAME is only known when the acting org is the profile's own org; an
 * env override naming a different org yields an id but no name. That test stays
 * a comparison of VALUES rather than a read of `source`, because an env
 * override naming the profile's own org is still the profile's org and its name
 * is still known.
 */
export function actingScope(resolved: ResolvedProfile, baseUrl: string): MountScope {
  const profileOrgId = resolved.profile.orgId;
  const { organizationId: orgId } = resolveOrganization(resolved.profile);
  return {
    profile: resolved.source === "override" ? undefined : resolved.name,
    orgId,
    orgName: orgId && orgId === profileOrgId ? resolved.profile.orgName : undefined,
    baseUrl
  };
}

/** Resolve the API key + base URL + acting-org scope from the SDK's auth chain. */
export function resolveAuth(opts: { apiKey?: string; baseUrl?: string; profile?: string }): {
  apiKey: string;
  baseUrl: string;
  scope: MountScope;
} {
  const resolved = resolveProfile(opts);
  const apiKey = opts.apiKey ?? resolved.profile.apiKey;
  if (!apiKey) {
    throw new Error("No API key. Run `nexus auth login` or pass --api-key.");
  }
  // Through the canon. This was a hand-rolled copy that put `NEXUS_BASE_URL`
  // above a NAMED `--profile`, which `resolveBaseUrl` orders the other way —
  // and the host it produces is not merely where the request goes, it is the
  // `url:` bucket a mount is RECORDED under, so a disagreement here outlives
  // the command that caused it.
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/$/, "");
  const scope = actingScope(resolved, baseUrl);
  if (!scope.orgId && !scope.profile) {
    // Raw --api-key/NEXUS_API_KEY with no org resolution: the acting org is
    // unknowable client-side. Record the mount in the base-URL fallback bucket
    // and say so loudly — `status` will show "?" and `unmount` matches by slug.
    printWarning(
      "Cannot determine the organization this mount will serve.",
      "The API key was passed directly (--api-key/NEXUS_API_KEY) and no NEXUS_ORGANIZATION_ID is set,",
      "so the mount is recorded without an org and scoped by base URL only.",
      "Prefer `nexus auth login` (or set NEXUS_ORGANIZATION_ID) so status/unmount can tell orgs apart."
    );
  }
  return { apiKey, baseUrl, scope };
}

// ── rclone preflight ──────────────────────────────────────────────────────────
//
// Run before any mint by every engine that spawns rclone. The binary probed is
// the PATH-resolved `rclone` the spawn below will run, so the two cannot
// disagree on a machine where a Homebrew build sits ahead of the official one.

/**
 * Whether macFUSE's kernel extension is approved: `load_macfuse` exits 0.
 *
 * 🔴 Three answers, not two. A loader that RAN and refused is a real refusal; a
 * loader that could not be run at all — absent from this macFUSE build, or not
 * executable by this user — establishes nothing. Collapsing the second into the
 * second sent a caller whose macFUSE was installed AND approved to Recovery mode
 * to approve it again, with no way forward. An unknown answer lets the mount
 * proceed: rclone meets the real library and reports the real reason, which is a
 * better test than a probe that could not run.
 */
function macFuseApproved(): boolean | "unknown" {
  try {
    execFileSync(MACFUSE_LOADER, [], { stdio: "ignore" });
    return true;
  } catch (error) {
    // ENOENT / EACCES: the loader never ran, so it said nothing about approval.
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || code === "EACCES") return "unknown";
    return false;
  }
}

/**
 * rclone loads exactly one of two FUSE libraries on macOS, macFUSE first. Linux
 * has FUSE in the kernel and needs no library check; Windows needs WinFsp, which
 * is not probed — the install hint names it.
 */
function fuseLibraryProblem(): RclonePreflightProblem | null {
  if (process.platform !== "darwin") return null;
  if (fs.existsSync(MACFUSE_LIBRARY)) {
    // `unknown` passes: we could not check, so we do not accuse.
    return macFuseApproved() === false ? { kind: "macfuse-not-approved" } : null;
  }
  return fs.existsSync(FUSE_T_LIBRARY) ? null : { kind: "no-fuse-library" };
}

/**
 * The `cmount` build tag is the mount capability on macOS and Windows only.
 * Linux rclone mounts through its own FUSE package (`cmd/mount`), which carries
 * no build tag at all, so on Linux the tag list says NOTHING about whether this
 * binary can mount and is not read.
 *
 * 🚨 THE LINUX ARM IS A COMPATIBILITY FLOOR, NOT TUNING. `rclone` is the DEFAULT
 * engine on Linux, and before this branch the whole gate was "`rclone version`
 * exits 0". Refusing a `no-tags-line` verdict there — an rclone old enough not
 * to print `go/tags:` — would break a plain `nexus workspace mount <slug>` for
 * a user who never opted into anything.
 */
function buildProblem(version: string): RclonePreflightProblem | null {
  if (process.platform === "linux") return null;
  const build = rcloneBuildVerdict(version);
  return build === "mount-capable" ? null : { kind: "no-mount-support", verdict: build };
}

function rclonePreflight(): RclonePreflightProblem | null {
  let version: string;
  try {
    version = execFileSync("rclone", ["version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return { kind: "rclone-missing" };
  }
  return buildProblem(version) ?? fuseLibraryProblem();
}

/** Refuse, naming the fix, before a mint that a failed spawn would waste. */
export function assertRcloneCanMount(engine: RcloneEngine): void {
  const problem = rclonePreflight();
  if (problem === null) return;
  throw failure(
    "local-failed",
    preflightProblemMessage(problem, engine),
    rcloneInstallHint(process.platform)
  );
}

/** Workspace slugs are slugified server-side: lowercase alphanumeric + hyphens. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reject anything that isn't a real workspace slug before it reaches
 * `path.join`/`path.resolve` (mount point) or the mount URL. Without this a
 * slug like `..` or `../foo` resolves the mount point outside `~/nexus`.
 */
export function assertMountableSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid workspace slug "${slug}". Slugs are lowercase letters, digits, and hyphens. ` +
        `Run \`nexus workspace list\` to see valid slugs.`
    );
  }
}

/**
 * Which workspace kinds the server refuses every write against, keyed
 * exhaustively on the SDK's `WorkspaceKind` so a kind added to the wire cannot
 * silently default to writable — this table stops compiling until someone
 * classifies it.
 *
 * 🚨 THE SERVER IS THE AUTHORITY AND THIS IS A PREDICTION OF IT. `KIND_IS_READ_ONLY`
 * in the backend's `workspace.entity.ts` is what actually answers 403, on the
 * WebDAV gateway and on every REST write. This copy exists only so the mount can
 * be made read-only UP FRONT instead of mounting read-write and letting the user
 * discover the refusal one failed save at a time.
 *
 * The two are compile-forced to be EXHAUSTIVE and are not forced to AGREE. A new
 * kind classified writable here and read-only there reproduces exactly the defect
 * this table removes, so classify it in both or in neither.
 */
const WORKSPACE_KIND_IS_READ_ONLY: Record<WorkspaceKind, boolean> = {
  DRIVE: false,
  CODE: true
};

/** True when the server will refuse every write against a workspace of this kind. */
export function isReadOnlyKind(kind: WorkspaceKind): boolean {
  return WORKSPACE_KIND_IS_READ_ONLY[kind];
}

/** What `resolveMountTarget` learned about the slug we're about to mount. */
interface MountTarget {
  /** True when an admin-shared workspace owns this slug. */
  shared: boolean;
  /** True when the calling org owns a workspace with this slug. */
  orgOwned: boolean;
  /** Immutable id of the copy we'll actually mount (the chosen one). */
  workspaceId?: string;
  /**
   * Storage kind of the copy we'll actually mount, and the reason this
   * function reads more than ownership. A CODE workspace is a read-only
   * projection, so mounting it read-write produces a drive that accepts a save
   * and then answers 403 — "Permission denied", naming nothing.
   *
   * Absent when the list couldn't be fetched for this slug, which is NOT the
   * same as "writable": see `resolveMountTarget`'s degradation note.
   */
  kind?: WorkspaceKind;
}

/**
 * Inspect the org's workspace list to learn whether `slug` is owned by an
 * org-owned workspace, an admin-shared one, or both — pick the id of the copy
 * the mount will serve (shared when `wantShared`, else org-owned-first,
 * matching the server's bare-slug resolution), and read that copy's storage
 * KIND so the caller can mount read-only when the server would refuse writes
 * anyway.
 *
 * Returns null if the list can't be fetched, so the caller falls back to a
 * plain bare-slug mount.
 *
 * ⚠️ `kind` IS ABSENT ON THE DEGRADED PATH, AND ABSENT IS NOT "WRITABLE".
 * A null return and a `kind`-less target both mean the same thing — nobody
 * asked the server — so the caller must not read either as permission to mount
 * read-write silently. The write still fails at the gateway; all that is lost
 * is the warning.
 */
/**
 * What the list call did, for a caller that must tell "could not ask" apart
 * from "asked and the slug is not shared".
 *
 * 🚨 A NULL `target` ALWAYS MEANS THE LIST CALL FAILED. A successful list
 * yields an object on every path, so `target === null` is never "not found" —
 * it is only ever "nobody asked the server". `listError` is that failure,
 * carried out rather than swallowed, so the caller can rethrow it and let the
 * CLI's own taxonomy name the cause. Swallowing it is what made `workspace
 * mount` report a network failure as CLI_UNKNOWN_ERROR.
 */
export type MountTargetResolution = {
  target: MountTarget | null;
  /** The error `workspaces.list()` threw, or `null` when it succeeded. */
  listError: unknown;
};

/**
 * The degrading wrapper, kept for callers that genuinely do not care WHY the
 * list was unavailable — the default bare-slug mount path, which is documented
 * above as best-effort. Anything that REPORTS a failure to the user must use
 * {@link resolveMountTargetDetailed} instead, or it will report a cause it
 * never looked at.
 */
export async function resolveMountTarget(
  client: ReturnType<typeof createClient>,
  slug: string,
  wantShared: boolean
): Promise<MountTarget | null> {
  return (await resolveMountTargetDetailed(client, slug, wantShared)).target;
}

export async function resolveMountTargetDetailed(
  client: ReturnType<typeof createClient>,
  slug: string,
  wantShared: boolean
): Promise<MountTargetResolution> {
  // `kind` is on the wire (`WorkspaceItemSchema`) and was missing from this
  // annotation AND from the SDK's own `Workspace` interface, so no compiler
  // anywhere could see that the mount path never read it. Both are widened
  // together; `packages/sdk/src/types/types-match-the-v1-contract.test.ts` now
  // pins the SDK half against the contract so it cannot narrow again.
  let workspaces: { id: string; slug: string; isShared: boolean; kind: WorkspaceKind }[];
  try {
    ({ workspaces } = await client.workspaces.list());
  } catch (listError) {
    return { target: null, listError };
  }
  const matches = workspaces.filter((w) => w.slug === slug);
  const shared = matches.find((w) => w.isShared);
  const orgOwned = matches.find((w) => !w.isShared);
  const chosen = wantShared ? shared : (orgOwned ?? shared);
  return {
    target: {
      shared: !!shared,
      orgOwned: !!orgOwned,
      workspaceId: chosen?.id,
      kind: chosen?.kind
    },
    listError: null
  };
}

/** The highest directory `fs.mkdirSync(target, { recursive: true })` would create, or null. */
function firstMissingAncestor(target: string): string | null {
  let missing: string | null = null;
  let current = target;
  while (!fs.existsSync(current)) {
    missing = current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return missing;
}

/**
 * What a mount needs on disk before the mounter runs. mount_webdav and FUSE
 * want an EXISTING, EMPTY directory; rclone on Windows wants the parent to
 * exist and the leaf NOT to (it creates the leaf itself). A non-empty
 * directory is refused before anything is created, so a refusal leaves the
 * disk as it found it.
 *
 * Returns the highest directory this call created — what `removeCreatedDirs`
 * takes back when the mount then fails — or null when everything existed.
 */
function createMountDir(mountPath: string): string | null {
  if (fs.existsSync(mountPath) && fs.readdirSync(mountPath).length > 0) {
    throw new Error(
      `Mount point ${mountPath} is not empty. Choose another with --at <path> or clear it first.`
    );
  }
  if (process.platform === "win32") {
    const parent = path.dirname(mountPath);
    const created = firstMissingAncestor(parent);
    fs.mkdirSync(parent, { recursive: true });
    if (fs.existsSync(mountPath)) fs.rmdirSync(mountPath);
    return created;
  }
  const created = firstMissingAncestor(mountPath);
  fs.mkdirSync(mountPath, { recursive: true });
  return created;
}

/**
 * Remove what `createMountDir` created — the mount point and every parent up
 * to `createdRoot` — as long as each is empty. A directory the user made
 * themselves (`--at ./ws`) is never touched: it was not created here.
 */
function removeCreatedDirs(mountPath: string, createdRoot: string | null): void {
  if (createdRoot === null) return;
  let current = mountPath;
  for (;;) {
    try {
      if (fs.existsSync(current)) {
        if (fs.readdirSync(current).length > 0) return;
        fs.rmdirSync(current);
      }
    } catch {
      return;
    }
    if (current === createdRoot) return;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

// ── rclone (FUSE): the spawn ──────────────────────────────────────────────────

/**
 * Start `rclone mount` detached, its stderr appended to `<logName>.log` under
 * the 0700 log directory, and give it two seconds to fail fast. Returns the
 * pid the registry records; throws with the log's tail when rclone never got
 * off the ground.
 *
 * The tail is passed through `redactBucketNames` before it reaches a terminal:
 * rclone names the bucket in every S3 error line, and the log is the one place
 * this CLI would otherwise print it.
 */
export async function spawnRcloneMount(
  logName: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<number | undefined> {
  ensureStateSubdir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${logName}.log`);
  const logFd = fs.openSync(logPath, "a");

  const child: ChildProcess = spawn("rclone", [...args], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env
  });

  // Listen for BOTH "error" (spawn failed — ENOENT/EACCES; an unhandled "error"
  // would otherwise crash the CLI) and "exit" (started but bailed: a refused
  // credential, a missing FUSE library). null = still running.
  const startFailure = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 2000);
    child.once("error", (err) => {
      clearTimeout(timer);
      resolve(`failed to start rclone: ${err.message}`);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(`rclone exited immediately (code ${code ?? 1})`);
    });
  });

  if (startFailure !== null) {
    let tail = "";
    try {
      tail = redactBucketNames(
        fs.readFileSync(logPath, "utf-8").trim().split("\n").slice(-10).join("\n")
      );
    } catch {
      /* log may not exist if spawn never started */
    }
    throw new Error(
      `${startFailure}.${tail ? `\nRecent log:\n${tail}` : ""}\n\nFull log: ${logPath}`
    );
  }

  child.unref(); // detach so this CLI process can exit while the mount lives on
  return child.pid;
}

export interface MountOutcome {
  /** The engine's half of the registry row; the caller adds the scope's. */
  readonly record: MountRecord;
  /** True when a read-write request was granted read: the drive is read-only. */
  readonly grantedReadOnly: boolean;
  /**
   * Saves a previous direct mount left in the cache, now uploading; null on
   * other engines, {@link PENDING_UPLOADS_UNKNOWN} when the cache cannot be read.
   */
  readonly pendingUploads: number | null;
  /**
   * The acting organization's name as the SERVER answered it during the mint;
   * null on the gateway engines, which mint nothing and so learn nothing. The
   * caller prefers it over the profile's saved copy when stamping the registry
   * row, because that copy is written at sign-in and never refreshed.
   */
  readonly serverOrgName: string | null;
}

/**
 * A crashed FUSE process can leave its mount-table entry behind — on Linux the
 * path then answers ENOTCONN to every read, including the emptiness check. A
 * dead pid-probed row is detached best-effort before its path is reused.
 */
export function detachDeadMount(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] === "pid") unmountPath(record.mountPath);
}

/**
 * The `pendingUploads` a `--json` document carries.
 *
 * 🔴 THREE ANSWERS, AND `null` ALREADY MEANS ONE OF THEM. The help defines it as
 * "null on other engines" — nothing to lose. `PENDING_UPLOADS_UNKNOWN` is
 * infinite so both in-process comparisons fail safe, but `JSON.stringify`
 * renders infinity as `null`, which lands the cache we could NOT read on top of
 * the value meaning there is nothing there — the exact conflation the sentinel
 * exists to prevent, one serialisation away. It goes out as the string
 * `"unknown"` instead, which no numeric comparison can mistake for zero.
 */
export function jsonPendingUploads(count: number | null | undefined): number | "unknown" | null {
  if (count === undefined || count === null) return null;
  return count === PENDING_UPLOADS_UNKNOWN ? "unknown" : count;
}

/** Saves a previous mount left behind, now queued on the same cache directory. */
export function printPendingUploads(count: number | null): void {
  if (count === null || count === 0) return;
  console.log(
    color.dim(
      `  ${describePendingUploads(count)} file(s) saved before the previous mount ended are uploading now.`
    )
  );
}

/**
 * Create the mount point, run the mounter, and take the directories back when
 * it fails — whatever failed, a mint or the spawn — so a mount that never came
 * up leaves the disk as it found it. What the user created (`--at ./ws`) is
 * never removed: only what this call made.
 */
export async function mountOnto(
  mountPath: string,
  mounter: () => Promise<MountOutcome>
): Promise<MountOutcome> {
  const created = createMountDir(mountPath);
  try {
    return await mounter();
  } catch (error) {
    removeCreatedDirs(mountPath, created);
    throw error;
  }
}

/** Why a drive that was asked for read-write came up read-only. */
export function printGrantedReadOnly(slug: string): void {
  console.log(
    color.yellow(
      `  Mounted READ-ONLY: Nexus granted read access to "${slug}" — your key's scopes, the ` +
        "workspace kind, or a shared library without a write grant. Saves would be refused, so " +
        "the drive refuses them first."
    )
  );
}

/** OS-native unmount of a mount point. Best-effort across platforms/engines. */
export function unmountPath(mountPath: string): void {
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [
          ["umount", [mountPath]],
          ["diskutil", ["unmount", mountPath]]
        ]
      : process.platform === "win32"
        ? [] // rclone mount on Windows stops when the process is killed
        : [
            ["fusermount", ["-u", mountPath]],
            ["umount", [mountPath]]
          ];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      return;
    } catch {
      /* try the next candidate */
    }
  }
}
