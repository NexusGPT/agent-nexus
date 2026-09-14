import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  type WorkspaceKind
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient, type Seconds, seconds } from "../client";
import {
  configFileState,
  loadConfig,
  resolveBaseUrl,
  type ResolvedProfile,
  resolveOrganization,
  resolveProfile,
  setProfileOrganization
} from "../config";
import { bindCommand } from "../contract-binding";
import { failure, handleError, invalidInput, reportFailure } from "../errors";
import {
  color,
  type Column,
  isJsonMode,
  printRecord,
  printSuccess,
  printTable,
  printWarning
} from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import { firstNonBlankOr } from "../util/present-text";
import { writeSecretFile } from "../util/secret-file";
import {
  AWS_CONFIG_REFUSAL_TEXT,
  awsConfigFor,
  cacheHoldsEntries,
  cacheProvenanceRefusal,
  checkRefreshPath,
  countPendingUploads,
  describePendingUploads,
  describeRefresh,
  DIRECT_MOUNT_INTRO_MARKER,
  directMountArgv,
  type DirectMountHealth,
  directMountHealth,
  discardPendingSavesHint,
  formatExpiry,
  FUSE_T_LIBRARY,
  isMountAccess,
  isMountId,
  MACFUSE_LIBRARY,
  MACFUSE_LOADER,
  mintBodyFor,
  MOUNT_CACHE_DIR,
  mountFix,
  mountIdFor,
  type MountSession,
  PENDING_UPLOADS_UNKNOWN,
  preflightProblemMessage,
  rcloneBuildVerdict,
  rcloneEnvFor,
  rcloneInstallHint,
  type RclonePreflightProblem,
  readSession,
  redactBucketNames,
  type RefreshJson,
  refreshJson,
  refreshVerdictIsUnhealthy,
  remountFix,
  sessionPathsFor,
  stableNodePath,
  toVolumeName,
  writeCacheOwner,
  writeSession
} from "../workspace-direct-mount";
import {
  alreadyMountedMessage,
  claimMountPoint,
  defaultMountPath,
  describeOwner,
  type Engine,
  ENGINE_LIVENESS,
  ENGINES,
  ensureStateSubdir,
  findMount,
  findMountsBySlug,
  LOG_DIR,
  mountKey,
  mountPointTakenMessage,
  type MountRecord,
  type MountScope,
  ownedElsewhereMessage,
  type RcloneEngine,
  readMounts,
  unmountMissMessage,
  writeMounts
} from "../workspace-mounts";
import {
  WORKSPACE_CREATE_CONTRACT,
  WORKSPACE_DELETE_CONTRACT,
  WORKSPACE_LIST_CONTRACT,
  WORKSPACE_RENAME_CONTRACT,
  WORKSPACE_RESTORE_CONTRACT,
  WORKSPACE_SEARCH_CONTRACT
} from "./workspace.contract.generated";
import { registerWorkspaceCredentialProcessCommand } from "./workspace-credential-process";

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

const ENGINE_VALUES = ["auto", ...ENGINES] as const;

function isEngine(value: string): value is Engine {
  return ENGINES.some((engine) => engine === value);
}

/**
 * The engines each platform can run. Asked for before any auth by `mount`, and
 * again by `remount` on the engine a row recorded — a row written on one
 * machine can be replayed on another. Exhaustive: a new engine does not compile
 * until someone decides where it runs.
 */
function refuseEngineOffPlatform(engine: Engine, caller: "mount" | "remount" = "mount"): void {
  const platform = process.platform;
  // 🔴 `remount` takes NO `--engine` and no `--read-only`: it replays the engine
  // the registry row recorded. Every fix below names a flag, so on `remount`
  // they are instructions the caller cannot type, on a row they cannot other-
  // wise move. The way out is the pair that CAN change an engine.
  if (caller === "remount") {
    const stuck = (why: string): never => {
      throw invalidInput(
        `${why} This drive's row recorded it, and remount replays the recorded engine.`,
        `Run: nexus workspace unmount <slug>, then nexus workspace mount <slug> --engine <one this platform runs>.`
      );
    };
    if (engine === "webdav" && platform !== "darwin")
      stuck("The native WebDAV engine is macOS-only.");
    if (engine === "rclone" && platform === "darwin") stuck("--engine rclone is retired on macOS.");
    if (engine === "direct" && platform === "win32") {
      stuck("--engine direct is not available on Windows yet.");
    }
    return;
  }
  switch (engine) {
    case "webdav":
      if (platform !== "darwin") {
        throw invalidInput(
          "The native WebDAV engine is macOS-only.",
          "Drop --engine: rclone (the same gateway, over FUSE) is the default on Linux and Windows."
        );
      }
      return;
    case "rclone":
      if (platform === "darwin") {
        throw invalidInput(
          "--engine rclone is retired on macOS: the WebDAV default and --engine direct cover everything it did.",
          'Use "--engine direct" (fast; needs macFUSE or FUSE-T) or drop --engine for the WebDAV default.'
        );
      }
      return;
    case "direct":
      if (platform === "win32") {
        throw invalidInput(
          "--engine direct is not available on Windows yet: its hourly renewal hook runs through a POSIX shell.",
          "Drop --engine: rclone (the Nexus gateway over FUSE) is the default on Windows."
        );
      }
      return;
    default:
      return engine satisfies never;
  }
}

/** `auto` is the engine that needs nothing installed where one exists, else the gateway over FUSE. */
function defaultEngine(): Engine {
  return process.platform === "darwin" ? "webdav" : "rclone";
}

function resolveEngine(requested: string | undefined): Engine {
  const value = requested ?? "auto";
  if (value !== "auto" && !isEngine(value)) {
    throw invalidInput(
      `Unknown --engine "${value}".`,
      `Use one of: ${ENGINE_VALUES.map((engine) => `"${engine}"`).join(", ")}.`
    );
  }
  const engine = value === "auto" ? defaultEngine() : value;
  refuseEngineOffPlatform(engine);
  return engine;
}

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────
// The registry record/IO lives in ../workspace-mounts, org-scoped per NEX-2360:
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
function isRecordedRcloneProcess(record: MountRecord): boolean {
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
function isMountLive(record: MountRecord): boolean {
  if (ENGINE_LIVENESS[record.engine] === "pid") return isRecordedRcloneProcess(record);
  return isMountPoint(record.mountPath);
}

/** Kill the detached rclone a pid-probed engine recorded, if it is still that process. */
function killRecordedProcess(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] !== "pid") return;
  if (typeof record.pid !== "number" || !isRecordedRcloneProcess(record)) return;
  try {
    process.kill(record.pid);
  } catch {
    /* already gone */
  }
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
  const baseUrl = (
    opts.baseUrl ||
    process.env.NEXUS_BASE_URL ||
    resolved.profile.baseUrl ||
    resolveBaseUrl()
  ).replace(/\/$/, "");
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

/**
 * Resolve the acting-org scope for `unmount` without requiring auth. Unmount
 * operates purely on the local registry, so a user with no configured profile
 * must still be able to run it — resolution failures fall back to `undefined`,
 * and the registry lookup then matches by slug.
 *
 * A raw `--api-key`/`NEXUS_API_KEY` override with no NEXUS_ORGANIZATION_ID also
 * resolves to `undefined`: it carries no org or profile identity (only a base
 * URL), so scoping the lookup by it would hide a row written under a real
 * org/profile key. Treating it as an unknown scope lets `findMount` fall back
 * to a slug match instead.
 *
 * That fallback is deliberately NARROW, because `undefined` here is also what a
 * typo'd `--profile` produces (the profile lookup throws and the `catch` below
 * swallows it, error and all). `findMount` will hand back a unique slug match
 * only when the record names NO org or profile; anything owned makes the caller
 * list the candidates and ask the user to name one. Otherwise a mistyped flag
 * would silently OS-detach and delete another org's mount.
 */
function resolveScopeBestEffort(opts: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}): MountScope | undefined {
  try {
    const resolved = resolveProfile(opts);
    const baseUrl = (
      opts.baseUrl ||
      process.env.NEXUS_BASE_URL ||
      resolved.profile.baseUrl ||
      resolveBaseUrl()
    ).replace(/\/$/, "");
    const scope = actingScope(resolved, baseUrl);
    if (!scope.orgId && !scope.profile) return undefined;
    return scope;
  } catch {
    return undefined;
  }
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
function assertRcloneCanMount(engine: RcloneEngine): void {
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
function assertMountableSlug(slug: string): void {
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
function isReadOnlyKind(kind: WorkspaceKind): boolean {
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

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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

// ── Native WebDAV (macOS `mount_webdav`) ──────────────────────────────────────

/** Mint a scoped, expiring mount token from the API key (header auth). */
/**
 * 🚨 THIS IS A RAW `fetch`, SO IT INHERITS NONE OF THE SDK'S ERROR TAXONOMY —
 * AND `handleError` CODES BY CLASS, NOT BY MESSAGE.
 *
 * A bare `fetch` rejection is a `TypeError`. It matches no branch in
 * `handleError`, so it fell all the way through to `CLI_UNKNOWN_ERROR` — a plain
 * unreachable-API failure reported as "something unknown happened", on a command
 * that had already diagnosed it. A non-2xx was the same story one line down: a
 * plain `Error` carrying the status only inside its message, where nothing reads
 * it.
 *
 * So every throw below raises the error the SDK transport would have raised for
 * the same failure. `workspace mount` then reports the same cause under the same
 * code as every command that goes through the client, and the mount route stops
 * being the one place in the CLI where a network failure is anonymous.
 *
 * The cause's own message is folded into the connection error rather than
 * dropped: the code is what the caller branches on, but the text is what a human
 * debugs with.
 */
async function mintMountToken(baseUrl: string, apiKey: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/dav/_token`, { headers: { "api-key": apiKey } });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw new NexusConnectionError(
      `Could not reach ${baseUrl} to mint a mount token${detail}`,
      cause instanceof Error ? cause : undefined
    );
  }
  if (!res.ok) {
    // MIRROR `http-client.ts`'s OWN MAPPING, never a code this file invents.
    // `handleError` prints `NexusApiError.code` as-is, so a CLI-minted
    // `MOUNT_TOKEN_FAILED` would read as a code the SERVER sent. Worse, it
    // routes by CLASS first: a 401 raised as a plain `NexusApiError` skips the
    // `NexusAuthenticationError` branch entirely and loses the "run nexus auth
    // login" hint — the one remedy that matters for the failure most likely
    // here. `HTTP_${status}` is the SDK's default for every other status, so
    // this route reports exactly what the same failure reports everywhere else.
    const message = `Failed to mint a mount token: ${await res.text()}`;
    throw res.status === 401
      ? new NexusAuthenticationError(message)
      : new NexusApiError(`HTTP_${res.status}`, message, res.status);
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("The mount-token endpoint returned no token.");
  return body.token;
}

async function mountWebdav(request: GatewayMountRequest): Promise<MountRecord> {
  const { slug, davPath, baseUrl, apiKey, mountPath, readOnly } = request;
  // `mount_webdav` rejects a URL that carries Basic userinfo OR a query string
  // (IllegalURLComponent — it bails before connecting) and can't send custom
  // headers, and its keychain path is unreliable/interactive. So authenticate
  // with a scoped, expiring token carried in the URL PATH, which the gateway
  // strips before anything logs the request line. Trade-off: the token is
  // visible in this mount process's argv to the same local user — it's scoped +
  // expiring (not the raw key); use `--engine direct` if even that matters.
  const token = await mintMountToken(baseUrl, apiKey);
  const url = `${baseUrl}/api/dav/_t/${encodeURIComponent(token)}/${davPath}`;

  const args: string[] = [];
  if (readOnly) args.push("-o", "ro");
  args.push(url, mountPath);
  try {
    execFileSync("mount_webdav", args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(
      `mount_webdav failed${stderr ? `: ${stderr}` : ""}.\n` +
        `If this is a self-signed/dev server, the native client requires a trusted HTTPS cert; ` +
        `use \`--engine direct\` there instead — it never talks to the gateway.`
    );
  }
  return {
    slug,
    engine: "webdav",
    mountPath,
    baseUrl,
    mountedAt: new Date().toISOString()
  };
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
async function spawnRcloneMount(
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

// ── The rclone engine: the gateway over FUSE ──────────────────────────────────

/**
 * Mount the Nexus WebDAV gateway through rclone. The API key travels in
 * rclone's environment (`RCLONE_WEBDAV_HEADERS`), never in argv, so the process
 * list does not show it. Tuned for freshness over caching — it is a live
 * shared drive.
 */
async function mountRclone(request: GatewayMountRequest): Promise<MountRecord> {
  const { slug, davPath, baseUrl, apiKey, mountPath, readOnly } = request;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RCLONE_WEBDAV_URL: `${baseUrl}/api/dav/${davPath}`,
    RCLONE_WEBDAV_VENDOR: "other",
    RCLONE_WEBDAV_HEADERS: `api-key,${apiKey}`
  };
  const args = [
    "mount",
    ":webdav:",
    mountPath,
    "--vfs-cache-mode",
    "writes",
    "--dir-cache-time",
    "5s",
    "--poll-interval",
    "5s"
  ];
  if (readOnly) args.push("--read-only");
  const pid = await spawnRcloneMount(slug, args, env);
  return {
    slug,
    engine: "rclone",
    mountPath,
    baseUrl,
    pid,
    mountedAt: new Date().toISOString()
  };
}

// ── The direct engine ─────────────────────────────────────────────────────────

/** The two pins a direct mount's renewal acts on — required, or the engine is refused. */
interface DirectPins {
  readonly profile: string;
  readonly orgId: string;
  readonly orgName?: string;
}

/** The way out every direct-only refusal ends with: the default engine has none of these needs. */
const OR_DROP_DIRECT = " Or drop --engine direct: the default engine needs none of this.";

/**
 * The direct engine renews its access every hour by re-reading the profile's
 * saved key and minting under the recorded organization. A key that arrived
 * through --api-key or NEXUS_API_KEY was never saved, so nothing could re-read
 * it; a scope with no organization has nothing to pin the drive to. Both are
 * refused BEFORE any mint, naming the fix.
 */
function directPins(scope: MountScope): DirectPins {
  if (scope.profile === undefined) {
    throw invalidInput(
      "--engine direct needs a saved profile: the API key came from --api-key or NEXUS_API_KEY, " +
        "and the drive's hourly renewal re-reads the key from the profile that saved it.",
      `Run: nexus auth login, then mount without --api-key.${OR_DROP_DIRECT}`
    );
  }
  if (scope.orgId === undefined) {
    throw invalidInput(
      `--engine direct needs an organization to pin the drive to, and profile "${scope.profile}" resolves none.`,
      `Run: nexus auth use-org <org> (or set NEXUS_ORGANIZATION_ID), then mount again.${OR_DROP_DIRECT}`
    );
  }
  return { profile: scope.profile, orgId: scope.orgId, orgName: scope.orgName };
}

/**
 * Write the server's organization name back into the profile that named the
 * org, so the NEXT mount reads a current one.
 *
 * The volume name can take the fresh value straight from the mint, but the
 * DEFAULT mount point cannot: `~/nexus/<org>/<slug>` is resolved before the
 * mint, deliberately, so every local refusal happens before a credential is
 * minted. Refreshing the stored copy is what closes that gap without moving the
 * mint ahead of the refusals.
 *
 * 🔴 ONLY when the profile still names the org this drive is pinned to. The
 * writer sets `orgId` and `orgName` TOGETHER, so calling it for a drive whose
 * pinned org is not the profile's current one would move the profile's active
 * organization — a remount of a drive pinned to an org the user has since
 * switched away from would silently switch them back. A remount reads its pins
 * from the REGISTRY ROW, not from the live scope, so the two genuinely differ.
 *
 * Silent on every failure. This is a label, and a read-only config directory
 * must not cost a caller the drive it just mounted successfully.
 */
function refreshProfileOrgName(pins: DirectPins, serverOrgName: string | null): void {
  if (serverOrgName === null || serverOrgName === pins.orgName) return;
  try {
    const profile = loadConfig().profiles[pins.profile];
    if (profile?.orgId !== pins.orgId) return;
    setProfileOrganization(pins.profile, pins.orgId, serverOrgName);
  } catch {
    // Nothing to report: the mount is fine, and the next mount tries again.
  }
}

/**
 * The credential_process line for this mount, refused before any mint when the
 * node binary or the CLI entry cannot be written into it. Both inputs are known
 * before the first network call, so the refusal costs no minted key.
 */
function directAwsConfigOrRefuse(mountId: string): string {
  const execPath = stableNodePath();
  const entry = process.argv[1];
  const config = awsConfigFor({ execPath, entry, mountId });
  if (config.ok) return config.text;
  const { field, because } = config.refusal;
  const offending = field === "execPath" ? execPath : entry;
  throw failure(
    "local-failed",
    `The credential_process line cannot be written: the ${field} ${offending} contains ${AWS_CONFIG_REFUSAL_TEXT[because]}.`,
    `Install node and the CLI under a path without that character, then mount again.${OR_DROP_DIRECT}`
  );
}

/** How a direct drive would come up read-only over saves that need write access to upload. */
type ReadOnlyCause = "requested" | "granted";

/**
 * Saves a previous mount left in the cache upload only through a read-write
 * drive on the same cache directory. A read-only drive there — asked for, or
 * all the server would grant — would sit on them forever, so it is refused
 * with the two ways out: let them upload, or discard them knowingly.
 */
function refusePendingUploadsUnderReadOnly(input: {
  readonly slug: string;
  readonly cacheDir: string;
  readonly pendingUploads: number;
  readonly cause: ReadOnlyCause;
}): void {
  if (input.pendingUploads === 0) return;
  const why =
    input.cause === "requested" ? "--read-only was asked for" : "Nexus now grants read-only access";
  const wayBack = input.cause === "requested" ? "drop --read-only" : "restore write access";
  throw failure(
    "local-failed",
    `${describePendingUploads(input.pendingUploads)} file(s) saved to "${input.slug}" have not uploaded yet, and ${why} — ` +
      "under which they would never upload.",
    `Either ${wayBack} and mount again so they upload, or ${discardPendingSavesHint(input.cacheDir)}.`
  );
}

/**
 * A DEAD direct row about to be replaced still owns two things on disk: its
 * session directory (a key that stays valid until it expires) and its cache.
 * Saves in that cache upload only through a direct mount on the SAME mount id,
 * so any other replacement is refused while they exist; otherwise the session
 * goes the way `unmount` sends it and the empty cache with it.
 */
function retireDeadDirectRow(
  record: MountRecord,
  replacement: { readonly engine: Engine; readonly mountId: string | null }
): void {
  if (record.engine !== "direct" || record.mountId === undefined) return;
  if (replacement.engine === "direct" && replacement.mountId === record.mountId) return;
  const cacheDir = sessionPathsFor(record.mountId).cacheDir;
  const pendingUploads = countPendingUploads(cacheDir);
  if (pendingUploads > 0) {
    throw failure(
      "local-failed",
      `${describePendingUploads(pendingUploads)} file(s) saved to "${record.slug}" by ${describeOwner(record)}'s previous ` +
        "direct mount have not uploaded yet, and this mount would not upload them.",
      `Run: ${remountFix(record.slug)} under that profile so they upload, or ${discardPendingSavesHint(cacheDir)}.`
    );
  }
  removeDirectSession(record);
}

/**
 * Retire a dead row the new mount replaces: its direct session and cache first
 * (this may refuse), then its mount-table entry, then its registry row.
 */
function retireDeadRow(
  mounts: Record<string, MountRecord>,
  hit: { readonly key: string; readonly record: MountRecord },
  replacement: { readonly engine: Engine; readonly mountId: string | null }
): void {
  retireDeadDirectRow(hit.record, replacement);
  detachDeadMount(hit.record);
  delete mounts[hit.key];
}

/**
 * A crashed FUSE process can leave its mount-table entry behind — on Linux the
 * path then answers ENOTCONN to every read, including the emptiness check. A
 * dead pid-probed row is detached best-effort before its path is reused.
 */
function detachDeadMount(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] === "pid") unmountPath(record.mountPath);
}

/**
 * A CODE workspace is refused on the direct engine outright. Its S3 prefix
 * holds engine-owned `.checkouts/` generations beside the files, the server
 * grades every human key `read` on it, and a drive that accepted saves under
 * `--vfs-cache-mode writes` would drop them at upload — the silent-loss shape.
 * The WebDAV engine mounts it read-only through Nexus instead.
 */
function refuseCodeWorkspaceOnDirect(slug: string, kind: WorkspaceKind): void {
  if (!isReadOnlyKind(kind)) return;
  throw invalidInput(
    `"${slug}" is a ${kind} workspace: a read-only projection of a git project whose storage also ` +
      "holds engine-owned checkout generations. The server serves it read-only, and a direct drive " +
      "would accept your saves and drop them at upload.",
    `Drop --engine direct: the default engine mounts "${slug}" read-only through Nexus. ` +
      "Change the files by pushing to the git project."
  );
}

interface DirectMountRequest {
  readonly slug: string;
  readonly mountPath: string;
  /** The access asked for; the server may grant less. */
  readonly readOnly: boolean;
  /** True when the admin-shared copy is the target — the mint then names it by id. */
  readonly shared: boolean;
  readonly workspaceId?: string;
  readonly mountId: string;
  readonly baseUrl: string;
  readonly pins: DirectPins;
  /** The aws.config text `directAwsConfigOrRefuse` already accepted. */
  readonly awsConfig: string;
  readonly client: ReturnType<typeof createClient>;
}

interface MountOutcome {
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
 * Delete the session directory only while it still holds THE session this run
 * wrote. Two `mount` invocations of one workspace share a mount id; the second
 * fails on the busy mount point, and an unconditional delete here would take
 * the first mount's key with it. A different key in the file means another
 * mount owns the directory now, and it is left alone.
 *
 * 🔴 ONLY a session that reads back and MATCHES authorises the delete. An
 * absent file is ours to clean; a MALFORMED one is not. A partially written
 * session is exactly what a concurrent mount produces — the reason the write is
 * atomic — so reading "malformed" as "mine" would let the run that lost the race
 * delete the winner's live credential, and that drive would stop renewing at its
 * next hour. Neither missing nor damaged is proof of ownership, so only a match
 * is taken as one.
 */
function removeOwnSession(mountId: string, own: MountSession): void {
  const current = readSession(mountId);
  const ours = current.ok
    ? current.session.credentials.accessKeyId === own.credentials.accessKeyId
    : current.why === "missing";
  if (ours) fs.rmSync(sessionPathsFor(mountId).dir, { recursive: true, force: true });
}

/**
 * Mount a workspace with the direct engine: mint, write the session and the
 * credential_process line, prove the refresh path, spawn rclone.
 *
 * The order is the failure budget. Every local check that can refuse runs
 * before the one network call, the mint; everything after the mint is inside
 * ONE catch that deletes the session directory, so a drive that never came up
 * leaves no credential on disk. The mount point is the caller's: it created it
 * and takes it back on failure.
 *
 * The bucket never enters argv: rclone is pointed at the alias `nxws:`, which
 * resolves to the bucket only inside the environment `rcloneEnvFor` builds.
 */
async function mountDirect(request: DirectMountRequest): Promise<MountOutcome> {
  const { slug, mountPath, mountId, pins } = request;
  const paths = sessionPathsFor(mountId);

  // BEFORE the mint, because it is a local fact and a refusal here costs no
  // credential: a leftover cache belonging to the OTHER copy of this slug must
  // not be drained into this one. The mount id cannot tell them apart — it
  // hashes `<kind>:<id>|<slug>`, and the org-owned and admin-shared workspaces
  // differ only in a field that key never carries — so the cache says so
  // itself.
  const wrongCopy = cacheProvenanceRefusal(paths, request.shared, slug);
  if (wrongCopy !== null) {
    throw failure(
      "local-failed",
      wrongCopy,
      `Mount the other copy so they upload — ${mountFix(slug, !request.shared)} — or ${discardPendingSavesHint(paths.cacheDir)}.`
    );
  }

  const pendingUploads = countPendingUploads(paths.cacheDir);
  if (request.readOnly) {
    refusePendingUploadsUnderReadOnly({
      slug,
      cacheDir: paths.cacheDir,
      pendingUploads,
      cause: "requested"
    });
  }

  const requestedAccess = request.readOnly ? "read" : "read-write";
  const minted = await request.client.workspaces.mintMountCredentials(
    slug,
    mintBodyFor({ shared: request.shared, id: request.workspaceId }, requestedAccess)
  );
  // The list may have been unreachable, or answered before a replacement: the
  // mint's own answer is the kind the drive would actually serve.
  refuseCodeWorkspaceOnDirect(slug, minted.workspace.kind);

  const grantedReadOnly = !request.readOnly && minted.access === "read";
  if (grantedReadOnly) {
    refusePendingUploadsUnderReadOnly({
      slug,
      cacheDir: paths.cacheDir,
      pendingUploads,
      cause: "granted"
    });
  }
  const readOnly = request.readOnly || grantedReadOnly;

  const mintedAt = new Date();
  // The name the SERVER holds, not the copy the profile saved at sign-in. That
  // copy is written by `auth login` / `use-org` / `switch` and re-read by
  // nothing, so an organization renamed afterwards kept labelling the volume,
  // the mount list and the default folder with its old name — the one thing the
  // org half of a volume name exists to get right. The profile's value stays as
  // the fallback: a lookup that answered none must not produce a nameless drive.
  const orgName = minted.organization.name ?? pins.orgName;
  refreshProfileOrgName(pins, minted.organization.name);
  const volumeName = toVolumeName(minted.workspace.name, orgName);
  const session: MountSession = {
    version: 1,
    mountId,
    profile: pins.profile,
    baseUrl: request.baseUrl,
    orgId: pins.orgId,
    workspace: {
      id: minted.workspace.id,
      slug: minted.workspace.slug,
      shared: minted.workspace.isShared
    },
    access: minted.access,
    volumeName,
    credentials: {
      accessKeyId: minted.credentials.accessKeyId,
      secretAccessKey: minted.credentials.secretAccessKey,
      sessionToken: minted.credentials.sessionToken
    },
    expiresAt: minted.expiresAt,
    mintedAt: mintedAt.toISOString()
  };

  try {
    writeSession(session);
    // The cache states which copy of the slug it belongs to, so a later mount of
    // the OTHER copy is refused instead of draining these saves into the wrong
    // workspace. Written beside the cache, not in the session: a dirty cache
    // deliberately outlives its session, and this fact has to outlive it too.
    writeCacheOwner(paths.cacheOwnerFile, { shared: request.shared });
    writeSecretFile(paths.awsConfigFile, request.awsConfig);

    // The same probe `credential-process --check` runs, before rclone is
    // spawned: a broken line makes rclone exit 1 with a misleading CRITICAL
    // ("is a file not a directory"), so the real cause is established here.
    const probe = checkRefreshPath(session);
    if (!probe.ok) {
      throw failure(
        "local-failed",
        `The drive's renewal path is not usable: ${probe.problem}.`,
        `Reinstall the CLI where node can run it, then mount again.${OR_DROP_DIRECT}`
      );
    }

    ensureStateSubdir(MOUNT_CACHE_DIR);
    // One log per mount, not per slug: two organizations' mounts of one slug
    // must not interleave their lines, nor show each other's tail on a failure.
    const pid = await spawnRcloneMount(
      `${slug}-${mountId}`,
      directMountArgv({ mountPath, cacheDir: paths.cacheDir, slug, volumeName, readOnly }),
      rcloneEnvFor({
        inherited: process.env,
        awsConfigFile: paths.awsConfigFile,
        mountId,
        region: minted.storage.region,
        bucket: minted.storage.bucket,
        prefix: minted.storage.prefix
      })
    );
    return {
      record: {
        slug,
        engine: "direct",
        mountPath,
        baseUrl: request.baseUrl,
        mountId,
        access: minted.access,
        workspaceId: minted.workspace.id,
        pid,
        mountedAt: mintedAt.toISOString()
      },
      grantedReadOnly,
      pendingUploads,
      serverOrgName: minted.organization.name
    };
  } catch (error) {
    removeOwnSession(mountId, session);
    throw error;
  }
}

/**
 * True exactly once per machine: the first direct mount writes the marker.
 * Owner-only like everything else under the state directory.
 */
function firstDirectMountOnThisMachine(): boolean {
  if (fs.existsSync(DIRECT_MOUNT_INTRO_MARKER)) return false;
  writeSecretFile(DIRECT_MOUNT_INTRO_MARKER, `${new Date().toISOString()}\n`);
  return true;
}

/** What every direct mount tells the user after the "Live shared drive" line. */
function printDirectMountFooter(slug: string): void {
  const onFailure =
    process.platform === "darwin"
      ? "you get a macOS notification and files show an error until it can"
      : "files show an error until it can";
  console.log(
    color.dim(
      "  Access renews itself about every hour while you use the drive — nothing to do. " +
        `If it cannot renew (offline, signed out) ${onFailure}; check with: nexus workspace status`
    )
  );
  console.log(
    color.dim(
      "  The drive does not survive logout or restart, and its renewal does not survive a reinstall of " +
        `node or this CLI. Afterwards run: nexus workspace remount ${slug}`
    )
  );
  if (process.platform === "darwin" && firstDirectMountOnThisMachine()) {
    console.log(
      color.dim(
        "  Notifications come from Terminal: if none appear, allow them in System Settings › Notifications › Terminal."
      )
    );
  }
}

/** The line every engine's mount ends with, then the direct engine's own. */
function printMountFooter(engine: Engine, slug: string): void {
  console.log(
    color.dim(
      `  Live shared drive — teammates and agents share these files. Unmount: nexus workspace unmount ${slug}`
    )
  );
  if (engine === "direct") printDirectMountFooter(slug);
}

interface DirectLeftovers {
  readonly pendingUploads: number;
  /** The expiry of the last minted key, which no call can revoke; null when unreadable. */
  readonly accessValidUntil: string | null;
}

/**
 * Delete a direct mount's session directory — the triplet and the
 * credential_process line — and its cache directory ONLY when that holds
 * nothing. rclone re-uploads dirty cache items on its next run with the same
 * cache directory, and `umount` never waits for the write-back, so a cache
 * with anything in it is the only copy of saves that have not reached the
 * workspace: it stays, counted, until `remount` drains it.
 */
function removeDirectSession(record: MountRecord): DirectLeftovers {
  // A corrupt id is treated like an absent one: `unmount` is the verb a user
  // reaches for to get OUT of a broken state, so it degrades to "nothing to
  // clean up" rather than throwing `sessionPathsFor`'s refusal at them.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return { pendingUploads: 0, accessValidUntil: null };
  }
  const paths = sessionPathsFor(record.mountId);
  const read = readSession(record.mountId);
  fs.rmSync(paths.dir, { recursive: true, force: true });
  const pendingUploads = countPendingUploads(paths.cacheDir);
  if (!cacheHoldsEntries(paths.cacheDir)) {
    fs.rmSync(paths.cacheDir, { recursive: true, force: true });
  }
  return { pendingUploads, accessValidUntil: read.ok ? read.session.expiresAt : null };
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
function jsonPendingUploads(count: number | null | undefined): number | "unknown" | null {
  if (count === undefined || count === null) return null;
  return count === PENDING_UPLOADS_UNKNOWN ? "unknown" : count;
}

/** Saves a previous mount left behind, now queued on the same cache directory. */
function printPendingUploads(count: number | null): void {
  if (count === null || count === 0) return;
  console.log(
    color.dim(
      `  ${describePendingUploads(count)} file(s) saved before the previous mount ended are uploading now.`
    )
  );
}

/** The one reason `--json` reports for a read-only drive: the cause the user cannot waive first. */
function readOnlyReasonFor(input: {
  readonly kindForcesReadOnly: boolean;
  readonly requested: boolean;
  readonly granted: boolean;
}): "kind" | "requested" | "granted" | null {
  if (input.kindForcesReadOnly) return "kind";
  if (input.requested) return "requested";
  if (input.granted) return "granted";
  return null;
}

interface RemountInput {
  readonly engine: Engine;
  readonly slug: string;
  readonly record: MountRecord;
  readonly key: string;
  readonly scope: MountScope;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly shared: boolean;
  readonly readOnly: boolean;
  /** The one global a remount carries into the mint: `--api-key` is deliberately NOT one (see below). */
  readonly globals: { readonly timeout?: Seconds };
}

/** The mint's ceiling when no `--timeout` is given — the SDK's own default, in the client's unit. */
const REMOUNT_MINT_TIMEOUT_SECONDS: Seconds = seconds(DEFAULT_REQUEST_TIMEOUT_MS / 1000);

/**
 * Mount a recorded row again, by its engine. A direct row is minted under the
 * organization and profile THE ROW recorded — they outrank whatever the shell
 * selects today, and an explicit `--api-key` is not passed on, because it would
 * outrank the profile inside `createClient` and mint under a key the hourly
 * renewal can never re-read — and re-uses its mount id, so rclone's cache
 * directory is the one the dead mount wrote into and its unsent saves drain on
 * start.
 */
async function remountRecord(input: RemountInput): Promise<MountOutcome> {
  const { slug, record } = input;
  const davPath = input.shared ? `_shared/${slug}` : slug;
  switch (input.engine) {
    case "webdav":
    case "rclone":
      settleGatewayMount(input.engine);
      return mountGateway({
        engine: input.engine,
        slug,
        davPath,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        mountPath: record.mountPath,
        readOnly: input.readOnly
      });
    case "direct": {
      const plan = planDirectMount(
        {
          profile: record.profile ?? input.scope.profile,
          orgId: record.orgId ?? input.scope.orgId,
          orgName: record.orgName ?? input.scope.orgName,
          baseUrl: record.baseUrl
        },
        record.mountId ?? mountIdFor(input.key)
      );
      const client = createClient({
        profile: plan.pins.profile,
        baseUrl: record.baseUrl,
        organizationId: plan.pins.orgId,
        timeout: input.globals.timeout ?? REMOUNT_MINT_TIMEOUT_SECONDS
      });
      return mountDirect({
        slug,
        mountPath: record.mountPath,
        readOnly: input.readOnly,
        shared: input.shared,
        workspaceId: record.workspaceId,
        mountId: plan.mountId,
        baseUrl: record.baseUrl,
        pins: plan.pins,
        awsConfig: plan.awsConfig,
        client
      });
    }
    default:
      return input.engine satisfies never;
  }
}

/** The engines that speak to the Nexus gateway; which one is the platform's call. */
type GatewayEngine = Exclude<Engine, "direct">;

/**
 * What a gateway mount needs, as NAMED fields rather than a positional run.
 *
 * `slug`, `davPath`, `baseUrl`, `apiKey` and `mountPath` are five consecutive
 * strings: passed positionally, swapping any two type-checks and produces a
 * drive that 401s or serves the wrong path, and the table below cannot catch it
 * because five strings satisfy any signature structurally. `DirectMountRequest`
 * beside it already takes this shape for the same reason.
 */
interface GatewayMountRequest {
  readonly engine: GatewayEngine;
  readonly slug: string;
  readonly davPath: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly mountPath: string;
  readonly readOnly: boolean;
}

/** What the direct engine settles locally before its first network call. */
interface DirectPlan {
  readonly mountId: string;
  readonly pins: DirectPins;
  readonly awsConfig: string;
}

/** What `mount` settled before its first network call, by engine. */
type MountPlan = { readonly engine: GatewayEngine } | ({ readonly engine: "direct" } & DirectPlan);

/**
 * The direct engine's local refusals, in the order they are cheapest: the pins
 * its renewal needs, the rclone build and FUSE layer its spawn needs, the
 * credential_process line its renewal runs through. `mount` and `remount` both
 * settle through here, so the same machine is refused in the same order by both.
 */
function planDirectMount(scope: MountScope, mountId: string): DirectPlan {
  const pins = directPins(scope);
  assertRcloneCanMount("direct");
  return { mountId, pins, awsConfig: directAwsConfigOrRefuse(mountId) };
}

/** A gateway engine settles only its spawn's preflight: rclone must be able to mount, webdav needs nothing. */
function settleGatewayMount(engine: GatewayEngine): void {
  if (engine === "rclone") assertRcloneCanMount(engine);
}

/** Nothing here reaches the network. */
function planMount(engine: Engine, scope: MountScope, key: string): MountPlan {
  if (engine !== "direct") {
    settleGatewayMount(engine);
    return { engine };
  }
  return { engine, ...planDirectMount(scope, mountIdFor(key)) };
}

const GATEWAY_MOUNTERS = {
  webdav: mountWebdav,
  rclone: mountRclone
} as const satisfies Record<GatewayEngine, (request: GatewayMountRequest) => Promise<MountRecord>>;

async function mountGateway(request: GatewayMountRequest): Promise<MountOutcome> {
  return {
    record: await GATEWAY_MOUNTERS[request.engine](request),
    grantedReadOnly: false,
    pendingUploads: null,
    // A gateway mount never mints, so it never hears the server's name for the
    // org. The caller falls back to the profile's copy, exactly as before.
    serverOrgName: null
  };
}

/**
 * Create the mount point, run the mounter, and take the directories back when
 * it fails — whatever failed, a mint or the spawn — so a mount that never came
 * up leaves the disk as it found it. What the user created (`--at ./ws`) is
 * never removed: only what this call made.
 */
async function mountOnto(
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
function printGrantedReadOnly(slug: string): void {
  console.log(
    color.yellow(
      `  Mounted READ-ONLY: Nexus granted read access to "${slug}" — your key's scopes, the ` +
        "workspace kind, or a shared library without a write grant. Saves would be refused, so " +
        "the drive refuses them first."
    )
  );
}

// ── CLAUDE.md note (so a local Claude Code knows the drive is live + shared) ──

const CLAUDE_MD_BEGIN = "<!-- nexus-workspace:begin -->";
const CLAUDE_MD_END = "<!-- nexus-workspace:end -->";

function workspaceClaudeMdSection(slug: string, mountPath: string, readOnly: boolean): string {
  const mode = readOnly ? "read-only" : "read-write";
  return [
    CLAUDE_MD_BEGIN,
    `## Nexus Workspace`,
    ``,
    `The Nexus workspace \`${slug}\` is mounted at \`${mountPath}\` (${mode}).`,
    ``,
    `- It is **live shared team storage** — other people and agents (including Ultimate Cue)`,
    `  may read and write the same files concurrently. Re-read a file before relying on`,
    `  cached contents; writes are last-write-wins per file.`,
    `- Treat it like a normal directory: \`bash\`, \`python\`, Read/Write/Glob all work on it.`,
    readOnly
      ? `- This mount is read-only; do not attempt to modify files under it.`
      : `- Changes you save propagate to the shared workspace within a few seconds.`,
    CLAUDE_MD_END
  ].join("\n");
}

/** Insert or replace the managed Nexus-workspace block in ./CLAUDE.md. */
function writeClaudeMdNote(slug: string, mountPath: string, readOnly: boolean): string {
  const target = path.join(process.cwd(), "CLAUDE.md");
  const section = workspaceClaudeMdSection(slug, mountPath, readOnly);
  let content = "";
  try {
    content = fs.readFileSync(target, "utf-8");
  } catch {
    /* file doesn't exist yet */
  }

  const begin = content.indexOf(CLAUDE_MD_BEGIN);
  const end = content.indexOf(CLAUDE_MD_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = content.slice(0, begin).replace(/\n*$/, "");
    const after = content.slice(end + CLAUDE_MD_END.length).replace(/^\n*/, "");
    content = [before, section, after].filter(Boolean).join("\n\n") + "\n";
  } else {
    content = (content ? content.replace(/\n*$/, "") + "\n\n" : "") + section + "\n";
  }
  fs.writeFileSync(target, content);
  return target;
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * Reads `config.json` once, and only when a direct row asks.
 *
 * 🔴 Answers `true` for a profile it could not look for. `loadConfig` returns an
 * empty config for a MISSING file and for a DAMAGED one alike, so a truncated
 * config would report every live drive as `broken — profile missing`, and the
 * fix that verdict prints is `nexus auth login`, which SAVES a fresh config over
 * the file nothing could read. The remedy would delete the profiles the
 * diagnosis only failed to see.
 *
 * So the absence has to be established before it is reported: only a config that
 * is readable, or genuinely absent, can say a profile is not in it.
 */
function profilePresence(): (name: string) => boolean {
  let profiles: Set<string> | null = null;
  let unreadable: boolean | null = null;
  return (name) => {
    unreadable ??= configFileState() === "unreadable";
    if (unreadable) return true;
    profiles ??= new Set(Object.keys(loadConfig().profiles));
    return profiles.has(name);
  };
}

function directHealthOf(
  record: MountRecord,
  profileExists: (name: string) => boolean,
  now: Date
): DirectMountHealth {
  // 🔴 THE SHAPE, NOT ONLY THE PRESENCE. `readMounts` parses and casts, so
  // `mountId` is a claim about a JSON file — and `sessionPathsFor` THROWS on a
  // malformed one, deliberately, because two of its paths are handed to a
  // recursive delete. That throw escapes the row's own `.map()` and takes the
  // whole command with it, so ONE corrupt row printed a generic error and NONE
  // of the caller's healthy mounts. Worse, its message names `workspace status`
  // as the way to check — the command it just killed. A bad row is a broken ROW.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return {
      verdict: {
        kind: "broken",
        what:
          record.mountId === undefined
            ? "mount id missing from the registry row"
            : `mount id "${record.mountId}" in the registry row is not 16 hex digits`,
        fix: remountFix(record.slug)
      },
      expiresAt: null,
      pendingUploads: 0
    };
  }
  return directMountHealth({ mountId: record.mountId, slug: record.slug, profileExists, now });
}

/** One registry row, projected for `--json` and rendered for the table. */
interface StatusRow {
  readonly json: {
    readonly slug: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mode: "ro" | "rw" | null;
    readonly orgId: string | null;
    readonly orgName: string | null;
    readonly profile: string | null;
    readonly mountPath: string;
    readonly mountId: string | null;
    readonly expiresAt: string | null;
    readonly refresh: RefreshJson | null;
    /** A count, `"unknown"` for a cache present and unreadable, `null` off the direct engine. */
    readonly pendingUploads: number | "unknown" | null;
    readonly live: "yes" | "no";
    readonly mountedAt: string;
  };
  readonly table: {
    readonly slug: string;
    readonly org: string;
    readonly profile: string;
    readonly mode: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mountPath: string;
    readonly live: "yes" | "no";
    readonly expires: string;
    readonly refresh: string;
    readonly pending: string;
  };
  readonly health: DirectMountHealth | null;
}

/**
 * The EFFECTIVE mode: what was asked for (`readOnly` — the flag, or a CODE
 * kind) or, on a direct row, the read grade the server granted instead. The
 * row keeps the request so `remount` can ask for it again; this column is
 * where the grant joins it, so a drive that refuses every write never prints
 * `rw`.
 */
function modeOf(record: MountRecord): "ro" | "rw" | null {
  // Mode is observable BEFORE writing now (NEX-2372). Legacy records predate
  // the field, so surface "unknown" rather than guessing rw.
  if (record.readOnly === undefined) return null;
  // A grade this CLI does not recognise is "unknown", never "read-write".
  // `access` comes out of the same parsed-and-cast registry file as `mountId`,
  // so `"READ"` or a truncated write would otherwise fall through the equality
  // below and print `rw` over a drive the server graded read — the one claim
  // this column exists to never make.
  if (record.access !== undefined && !isMountAccess(record.access)) return null;
  return record.readOnly || record.access === "read" ? "ro" : "rw";
}

function statusRow(
  record: MountRecord,
  now: Date,
  profileExists: (name: string) => boolean
): StatusRow {
  const health = record.engine === "direct" ? directHealthOf(record, profileExists, now) : null;
  const live = isMountLive(record) ? "yes" : "no";
  const expiresAt = health?.expiresAt ?? null;
  const json: StatusRow["json"] = {
    slug: record.slug,
    engine: record.engine,
    kind: record.shared ? "shared" : "org",
    mode: modeOf(record),
    // Acting org + profile pinned at mount time (NEX-2360/NEX-2372). Null on
    // legacy records and unknown-org (--api-key) mounts.
    orgId: record.orgId ?? null,
    orgName: record.orgName ?? null,
    profile: record.profile ?? null,
    mountPath: record.mountPath,
    // The direct engine's per-mount id — a hash, never a storage name.
    mountId: record.mountId ?? null,
    expiresAt: health?.expiresAt ?? null,
    refresh: health === null ? null : refreshJson(health.verdict),
    pendingUploads: jsonPendingUploads(health?.pendingUploads),
    live,
    mountedAt: record.mountedAt
  };
  return {
    json,
    table: {
      slug: json.slug,
      org: firstNonBlankOr([json.orgName, json.orgId], "?"),
      profile: json.profile ?? "-",
      mode: json.mode ?? "?",
      engine: json.engine,
      kind: json.kind,
      mountPath: json.mountPath,
      live,
      expires: expiresAt === null ? "-" : formatExpiry(expiresAt, now),
      refresh: health === null ? "-" : describeRefresh(health.verdict, now, live === "yes"),
      pending: health === null ? "-" : describePendingUploads(health.pendingUploads)
    },
    health
  };
}

/** The fields the status refusal names a row by. */
interface StatusRowIdentity {
  readonly slug: string;
  readonly orgName: string | null;
  readonly orgId: string | null;
  readonly mountPath: string;
}

function describeStatusRow(row: StatusRowIdentity): string {
  return `  ${row.slug}  [${firstNonBlankOr([row.orgName, row.orgId], "org not recorded")}]  ${row.mountPath}`;
}

/**
 * PRINT the refusal an unhealthy registry means and RETURN its exit code.
 *
 * Two shapes share one document: rows whose mount is GONE, and direct rows
 * whose mount may be live but whose next renewal cannot succeed — a failed
 * refresh with a non-transient reason, or a session, path or profile the
 * helper needs that is no longer there. Both are `local-failed`, and the
 * category's own declaration is the whole argument: "a local operation this
 * CLI performed failed … nothing about the caller's input is wrong and no
 * retry against the API helps". No server is involved in this command at all
 * — it reads the local registry — so `remote-error` would name a host that was
 * never contacted.
 *
 * ⚠️ ASSIGN THE RETURN VALUE. `reportFailure` only writes the document; a bare
 * call emits a perfect error and exits `0`, which is the class this change is
 * draining.
 */
function reportUnhealthyMounts(
  dead: readonly StatusRowIdentity[],
  broken: readonly (StatusRowIdentity & { readonly refresh: string })[]
): number {
  const lines: string[] = [];
  if (dead.length > 0) {
    // 🚨 THE MOUNT POINT, NEVER THE SLUG ALONE. The same slug can be mounted
    // for several organizations — `workspace status` exists partly to show
    // that — and under --json this document REPLACES the rows, so a message
    // naming only the slug leaves a reader unable to tell WHICH of two mounts
    // died. The path is the one field that is unique per mount by
    // construction: `workspace mount` refuses a mount point another org
    // already holds.
    lines.push(
      `${String(dead.length)} recorded mount(s) are NOT live:`,
      ...dead.map(describeStatusRow)
    );
  }
  if (broken.length > 0) {
    lines.push(
      `${String(broken.length)} direct mount(s) cannot renew their access:`,
      ...broken.map((row) => `${describeStatusRow(row)}\n    ${row.refresh}`)
    );
  }
  const hints: string[] = [];
  if (dead.length > 0) {
    // ⚠️ NO BARE "unmount <slug>" HERE. That verb RESOLVES BY ACTING ORG and
    // takes no path, so on a slug mounted for two orgs it can detach the LIVE
    // one and leave the dead row that caused this exit. Its own refusal lists
    // the candidates when the acting org owns none of them, which is the safe
    // route — so the reader is pointed at the path and told what decides.
    hints.push(
      'A row reading live:no means the LOCAL mount is gone; it says nothing about the workspace on the server. "workspace unmount" and "workspace remount" resolve by ACTING ORG and take no path, so switch profile or pass --profile to reach the org named above before using either — on a slug mounted for two orgs they can otherwise act on the live one.'
    );
  }
  if (broken.length > 0) {
    hints.push(
      "A renewal that cannot succeed leaves the drive erroring on every click once its access expires; each row above names its fix."
    );
  }
  return reportFailure("local-failed", lines.join("\n"), hints.join(" "));
}

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command("workspace")
    .description("Mount Nexus workspaces as a live shared drive for local Claude Code");

  ws.addHelpText(
    "after",
    `
TWO GROUPS OF SUBCOMMAND, AND THEY FAIL FOR OPPOSITE REASONS.

  Public API v1 (need a valid key and the network):
    list · create · rename · delete · search · restore
  This machine's mount registry (no Public API call):
    mount · remount · unmount · status · credential-process

"unmount" and "status" keep working after a key is revoked or while offline —
they report what THIS machine recorded, never what the server holds. "mount"
and "remount" are in the local group but still reach the server with your API
key — the WebDAV engine to mint a mount token, the direct engine to mint an
hour of storage access — so they are the local-group commands a revoked key
breaks. "credential-process" is the direct engine's own hourly renewal; it is
run by the drive, not by you.

A mounted workspace deleted server-side still appears in "status". When the two
disagree, "list" is the truth and "status" is the local record.

THE DRIVE IS LIVE AND SHARED. Teammates and agents read and write the same
files within seconds, and writes are last-write-wins per file. There is no
checkout, no lock you can rely on and no merge — re-read before you overwrite.

THE WEBDAV ENGINE IS NOT A POSIX FILESYSTEM. It is WebDAV behind a userspace
mount, so in-place edits are not supported: mv, sed -i and >> answer "Function
not implemented". Read the file, transform it in memory, and write the whole
file back. Ordinary create / read / overwrite / delete all work.

DELETING NEEDS workspaces:delete, WHICH write DOES NOT IMPLY — a read-write
mount whose key lacks it fails every rm with a 403 while cp keeps working.
workspaces:read is enough to MOUNT and to read; writing needs workspaces:write,
which does carry the read (that is the only implication scopes have, and it is
same-resource only).

THREE ENGINES, AND THEY DIFFER IN WHO HOLDS THE CREDENTIAL:
  webdav   macOS only, and the default there. Nothing to install. Every request
           is authorised by Nexus, so a revoked key stops the drive at once.
  rclone   The default on Linux and Windows: rclone mounting the same gateway
           over FUSE, authorised by Nexus per request, working with a raw
           --api-key. Retired on macOS, where the two others cover it.
  direct   Opt-in (--engine direct) on macOS and Linux; not on Windows yet.
           rclone signs storage requests itself with a one-hour key that renews
           itself while you use the drive. Faster, and it needs rclone plus a
           FUSE layer: macFUSE or FUSE-T on macOS, fuse3 on Linux. The drive
           dies at logout or restart; "workspace remount" brings it back and
           uploads whatever the dead mount had not sent.

MOUNTING WITH rclone OR direct NEEDS rclone AND A FUSE LAYER:
  Linux    sudo -v ; curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    the OFFICIAL rclone from https://rclone.org/downloads/ — Homebrew's
           build refuses to mount — plus macFUSE (https://macfuse.github.io) or
           FUSE-T (https://www.fuse-t.org). Or use the default engine, which
           needs nothing.

A SLUG IS NOT UNIQUE. The same slug can name both an org-owned workspace and
an admin-shared one; the bare slug resolves to the org-owned copy and --shared
picks the other.

THERE IS NO UPLOAD VERB HERE, AND THAT IS THE FIRST THING PEOPLE LOOK FOR. This
namespace creates, mounts and searches workspaces; it never puts a file into
one. Two routes do:

  1. Mount it and write through the drive — the normal way.
  2. WebDAV directly, when a mount is not available (CI, a container):
       $ curl -X PUT -u "$NEXUS_API_KEY:" --data-binary @local.md \\
           <base-url>/webdav/<slug>/notes/local.md

To LIST what is in a workspace without mounting, "workspace search" answers
server-side — and one raw read gives you a plain directory listing:

  $ nexus api GET /workspaces/<slug>/files --query path=<dir>

Neither listing needs a mount, which makes them the cheap answer to "is my file
there" — the question that otherwise drives a mount.`
  );

  // ── list ─────────────────────────────────────────────────────────────────
  const list = ws
    .command("list")
    .description("List the workspaces in your organization")
    .option(
      "--folder-stats",
      "Include a per-top-level-folder breakdown (depth-1) in each workspace's stats"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace list
  $ nexus workspace list --json
  $ nexus workspace list --folder-stats --json

Notes:
  READ THE KIND COLUMN BEFORE YOU MOUNT. "org" is your organization's own
  workspace, "shared" is an admin-shared one. Two rows can carry the SAME slug,
  one of each — the bare slug then mounts the org copy and --shared the other.
  🚨 THE TABLE'S "KIND" AND --json's "kind" ARE DIFFERENT FIELDS WITH THE SAME
  NAME. The column above shows OWNERSHIP (org / shared); the JSON key literally
  called kind shows the STORAGE TYPE (CODE / DRIVE), which is the sense
  "workspace create" documents. So a script reading .kind and testing for
  "org" or "shared" never matches, and one testing for "CODE" is answering a
  different question than the table. In --json, ownership is isShared.
  --folder-stats ADDS A COUNT, NOT THE FOLDERS. It costs a depth-1 walk
  server-side, the table shows only how many top-level folders there are, and
  the per-folder breakdown is --json only.
  Files and Size are server-side totals for the whole workspace; they say
  nothing about whether it is mounted.
  Needs workspaces:read. Unpaginated.`
    )
    .action(async (opts: { folderStats?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { workspaces } = await client.workspaces.list({ folderStats: opts.folderStats });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspaces, null, 2));
          return;
        }
        // Surface which copy is which: a slug can name both an org-owned and an
        // admin-shared workspace, and the bare slug mounts the org-owned one
        // (NEX-2362). The "Kind" column makes the collision visible at a glance.
        const rows = workspaces.map((w) => ({
          slug: w.slug,
          name: w.name,
          kind: w.isShared ? "shared" : "org",
          files: w.stats.fileCount,
          size: formatBytes(w.stats.totalBytes),
          ...(opts.folderStats ? { folders: w.stats.folders?.length ?? 0 } : {})
        }));
        // Hoisted so the conditional gets a contextual type. Spread inline, the
        // best-common-type of `[]` and the one-element literal widens `key` to
        // `string` and takes the whole column list out of the key check.
        const folderColumn: Column<(typeof rows)[number]>[] = opts.folderStats
          ? [{ key: "folders", label: "Folders" }]
          : [];
        printTable(rows, [
          { key: "slug", label: "Slug" },
          { key: "name", label: "Name" },
          { key: "kind", label: "Kind" },
          { key: "files", label: "Files" },
          { key: "size", label: "Size" },
          ...folderColumn
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search ─────────────────────────────────────────────────────────────────
  const search = ws
    .command("search")
    .description("Search a workspace's docs server-side by keyword and/or frontmatter (no mount)")
    .argument("<slug>", "Workspace slug")
    .option(
      "--query <text>",
      "Keyword (case-insensitive substring over content, frontmatter, path)"
    )
    .option(
      "--frontmatter <key=value>",
      "Frontmatter filter (repeatable); all must hold, e.g. --frontmatter status=done",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[]
    )
    .option("--path <folder>", "Restrict the search to a subfolder (workspace-relative)")
    .option("--limit <n>", "Max results to return (1–200, default 50)", (v) => parseInt(v, 10))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace search support-docs --query "refund policy"
  $ nexus workspace search support-docs --frontmatter status=published
  $ nexus workspace search support-docs --query onboarding --frontmatter owner=growth --json
  $ nexus workspace search support-docs --query api --path guides --limit 20

Notes:
  TEXT DOCUMENTS ONLY, BY EXTENSION. Markdown, txt, json/jsonl, yaml and their
  siblings are read; a PDF, an image, a binary or a file with NO EXTENSION is
  never opened, so its content cannot match and its absence is not reported.
  This is a document search, not a file search.
  IT STOPS AFTER 1000 FILES AND SAYS SO QUIETLY. Past that the answer is
  incomplete and truncated is true — the table prints "(truncated — narrow your
  search)" on STDERR and --json carries the flag. AN EMPTY RESULT WITH
  truncated: true IS NOT "NO MATCHES". Narrow with --path and try again.
  LARGE FILES ARE READ AS A PREFIX ONLY (first 256 KB), so a match deep inside
  a big document is missed silently.
  Every --frontmatter key=value must hold, ANDed with --query. Repeat the flag
  for several. Values are compared as the flattened string form of the
  frontmatter, so a list matches its ", "-joined rendering.
  At least one of --query / --frontmatter is required; the CLI refuses locally
  rather than scanning everything.
  MATCHED tells you WHERE it hit — content, frontmatter or path. A path-only
  hit has no snippet, which is why SNIPPET can be blank on a real match.
  🚨 A NON-TEXT FILE CANNOT BE FOUND BY ITS PATH EITHER, ONLY BY ITS CONTENT.
  Non-text files are dropped before matching runs, so the path axis never
  applies to them: searching an image's EXACT filename answers "No matches",
  which reads as "that file is not in this workspace" when it is sitting there.
  Confirm with a mount or with "nexus api GET /workspaces/<slug>/files
  --query path=<dir>" before believing an absence.
  scanned (STDERR, or --json) is how many files were actually opened, not how
  many exist.
  No mount needed, and no local files are read — this runs server-side.
  --json IS THE RAW SERVER OBJECT, NOT A {data, meta} ENVELOPE:
  {results, scanned, truncated}. Each hit is {path, size, modifiedAt, snippet,
  frontmatter, matchedIn}. snippet and frontmatter are null rather than absent
  when there is none, and matchedIn is an ARRAY — one hit can carry
  ["frontmatter","content"] at once, so a script comparing it to a single
  string misses every multi-axis hit. The MATCHED column above is that array
  joined with ", ".`
    )
    .action(
      async (
        slug: string,
        opts: { query?: string; frontmatter: string[]; path?: string; limit?: number }
      ) => {
        try {
          if (!opts.query && opts.frontmatter.length === 0) {
            throw new Error(
              "Provide --query and/or at least one --frontmatter key=value filter to search."
            );
          }
          for (const f of opts.frontmatter) {
            if (!f.includes("=") || f.split("=", 1)[0].trim().length === 0) {
              throw new Error(
                `Invalid --frontmatter "${f}". Use key=value form with a non-empty key.`
              );
            }
          }

          const client = createClient(program.optsWithGlobals());
          const res = await client.workspaces.search(slug, {
            query: opts.query,
            frontmatter: opts.frontmatter.length > 0 ? opts.frontmatter : undefined,
            path: opts.path,
            limit: opts.limit
          });

          if (isJsonMode()) {
            console.log(JSON.stringify(res, null, 2));
            return;
          }

          if (res.results.length === 0) {
            console.log(`No matches (scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}).`);
            return;
          }

          printTable(
            res.results.map((hit) => ({
              path: hit.path,
              match: hit.matchedIn.join(", "),
              snippet: (hit.snippet ?? "").replace(/\s+/g, " ").slice(0, 80)
            })),
            [
              { key: "path", label: "Path" },
              { key: "match", label: "Matched" },
              { key: "snippet", label: "Snippet" }
            ]
          );
          const shown = `${res.results.length} match${res.results.length === 1 ? "" : "es"}`;
          const scanned = `scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}`;
          console.error(
            color.dim(
              `${shown}, ${scanned}${res.truncated ? " (truncated — narrow your search)" : ""}`
            )
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── create ───────────────────────────────────────────────────────────────
  const create = ws
    .command("create")
    .description("Create a new workspace — the slug is derived from the name and is permanent")
    .argument("<name>", "Workspace name (the slug is derived from it)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace create "Support Docs"
  $ nexus workspace create "Support Docs" --json
  $ nexus workspace create -- "-launch-notes"

Notes:
  THE SLUG IS DERIVED AND THEN IMMUTABLE. "Support Docs" becomes support-docs,
  and "workspace rename" changes the NAME ONLY — the slug you get here is the
  one every mount, search and grant will use for the life of the workspace.
  Read it from the output; do not assume the slugification rule.
  A NAME WITH NO ALPHANUMERICS IS REFUSED — it would slugify to nothing.
  A NAME STARTING WITH A HYPHEN NEVER REACHES THAT REFUSAL. Commander reads it
  as a flag first, so "workspace create ---" answers "error: unknown option
  '---'" and exits before any name is sent. Put "--" ahead of the name and the
  parser stops looking, which is where the refusal above actually applies.
  SLUGS ARE UNIQUE PER ORGANIZATION, so a second "Support Docs" is a conflict,
  not a second workspace. Note that an ADMIN-SHARED workspace may already carry
  the slug you want; that does not block creation, and you then have two rows
  with one slug — see "nexus workspace list" -> KIND.
  Creates a DRIVE workspace. CODE workspaces are read-only projections of a
  git project and are not creatable here.
  Needs workspaces:write.`
    )
    .action(async (name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.create({ name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printSuccess(`Created workspace "${workspace.name}"`, { slug: workspace.slug });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── rename ───────────────────────────────────────────────────────────────
  const rename = ws
    .command("rename")
    .description("Rename a workspace — the DISPLAY NAME only, the slug never changes")
    .argument("<slug>", "Workspace slug")
    .argument("<name>", "New name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace rename support-docs "Customer Support Docs"

Notes:
  THE SLUG IS IMMUTABLE AND THIS DOES NOT TOUCH IT. Only the display name
  changes, so mounts, grants, search and ~/nexus/<slug> all keep working — and
  the slug can end up saying nothing about the name. There is no way to change
  a slug: create a new workspace and move the files.
  Existing mounts are unaffected and need no remount.
  A slug that is not yours, or is narrowed away from you, answers 404.
  Needs workspaces:write.`
    )
    .action(async (slug: string, name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.rename(slug, { name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printRecord(workspace);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ───────────────────────────────────────────────────────────────
  const remove = confirmable(ws.command("delete"))
    .description("Delete a workspace and PURGE every file in it — not a soft delete")
    .argument("<slug>", "Workspace slug")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace delete scratch
  $ nexus workspace delete scratch --yes

Notes:
  IT PURGES THE FILES, NOT JUST THE ROW. Every object is deleted from storage
  first and the workspace record second, so this is NOT the 72h soft delete
  that "workspace restore" recovers from — "workspace restore" cannot bring a
  deleted WORKSPACE back, only files deleted from a live one.
  ANYTHING MOUNTED KEEPS ITS MOUNT POINT AND STOPS WORKING. The local directory
  and the registry entry survive as a dead mount; run
  "nexus workspace unmount <slug>" yourself afterwards.
  ROLE GRANTS AND AGENT LINKS TO IT GO SILENTLY, AND YOU CANNOT LIST THEM
  FIRST. "nexus role workspace-grants" is indexed by ROLE — its signature is
  workspace-grants <role> — so answering "which Roles reach this workspace"
  means running it once per Role and filtering. There is no workspace-indexed
  read. Either do that sweep, or accept that grants are lost unrecorded.
  A CODE WORKSPACE USUALLY BACKS A VIBE APP. Rows whose storage type is CODE
  (the "kind" key in --json) are projections of a git project, and share a name
  with the app and the project. Check "nexus apps list" for a matching name
  before deleting one.
  A PARTIAL FAILURE LEAVES THE WORKSPACE PRESENT. If the storage purge fails
  the record is kept on purpose so a retry can finish; re-run the same command.
  --yes is REQUIRED when stdin is not a TTY: without it a script exits NON-ZERO
  rather than deleting. Every destructive command in this CLI refuses the
  same way. "nexus --help" carries the exit-code table.
  Needs workspaces:delete, which workspaces:write does not imply.`
    )
    .action(async (slug: string, opts: { yes?: boolean }) => {
      try {
        // ⚠️ A REFUSAL'S `hint` IS THE NEXT STEP FOR *THIS* FAILURE, NEVER A
        // SECOND PLACE FOR THE COMMAND'S NOTES. The hand-rolled version of this
        // gate carried "Needs workspaces:delete, which workspaces:write does not
        // imply" — true, already in `--help`, and about a permission failure that
        // did not happen here. Nothing was refused for scope; it was refused for
        // a missing confirmation, so a script following the hint would go and
        // widen a token that was never the problem. `confirmDestructive` owns the
        // wording now, and it says the one thing that is true of every refusal it
        // emits.
        if (!(await confirmDestructive(`Delete workspace "${slug}" and all its files?`, opts))) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        await client.workspaces.delete(slug);
        printSuccess(`Deleted workspace "${slug}".`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── restore ──────────────────────────────────────────────────────────────
  const restore = ws
    .command("restore")
    .description("Restore a deleted file or folder from backup (within the recovery window)")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The deleted file or folder path (relative to the workspace root)")
    .addHelpText(
      "after",
      `
Recovers a file or folder that was deleted from a workspace, using the S3
backup (version history, retained ~30 days — past the 72h soft-delete window).
Pass the path that was deleted; everything currently deleted at/under it is
restored. Live files are never overwritten.

Examples:
  $ nexus workspace restore support-docs reports/q3.pdf
  $ nexus workspace restore support-docs reports      # restore a whole folder

  The whole round trip. The delete has no verb here — it happens on a mount:
  $ rm ~/nexus/support-docs/notes/probe.md
  $ nexus workspace search support-docs --query probe
  $ nexus workspace restore support-docs notes/probe.md

Notes:
  IT RESTORES FILES INTO A LIVE WORKSPACE. It cannot bring back a workspace
  deleted with "workspace delete" — that purges storage, so there is nothing
  left to restore from.
  "Nothing to restore" IS A SUCCESS, NOT AN ERROR, and it means one of three
  different things: the path is past the recovery window, it was never
  deleted, or it is already present. The command cannot tell them apart, and
  it exits 0. Check "nexus workspace search" or the mount before assuming the
  file is unrecoverable.
  LIVE FILES ARE NEVER OVERWRITTEN. A path that still exists is skipped, so
  this is safe to re-run and cannot be used to roll a file back to an older
  version — delete it first, then restore.
  THE PATH IS THE ONE THAT WAS DELETED, workspace-relative and with no leading
  slash. Given a folder, everything currently deleted at or under it comes
  back.
  Read the restored count and the paths it prints; --json carries both.
  THIS IS THE UNDO FOR AN OPERATION THIS NAMESPACE CANNOT PERFORM. Nothing
  under "nexus workspace" deletes a FILE — "workspace delete" destroys the
  whole workspace — so whatever you are undoing happened on a mount or over
  WebDAV. "nexus workspace --help" carries both of those routes.`
    )
    .action(async (slug: string, filePath: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workspaces.restore(slug, { path: filePath });
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.count === 0) {
          console.log(
            color.dim(
              `Nothing to restore at "${filePath}" — it isn't in the recovery window, was never deleted, or is already present.`
            )
          );
          return;
        }
        printSuccess(`Restored ${result.count} file${result.count === 1 ? "" : "s"} to "${slug}"`);
        for (const p of result.restored) {
          console.log(color.dim(`  ${p}`));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── mount ────────────────────────────────────────────────────────────────
  ws.command("mount")
    .description("Mount a workspace as a live drive so local Claude Code can use it")
    .argument("<slug>", "Workspace slug (see `nexus workspace list`)")
    .option("--at <path>", "Mount point (default: ~/nexus/<org>/<slug>)")
    .option(
      "--read-only",
      "Mount read-only (a CODE workspace is read-only regardless — this can only add it)"
    )
    .option(
      "--shared",
      "Mount the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .option(
      "--engine <engine>",
      "Mount engine: auto (default), webdav (native, macOS), rclone (the gateway over FUSE; Linux/Windows), " +
        "or direct (rclone signing storage itself)",
      "auto"
    )
    .option("--claude-md", "Write a managed note about the mount into ./CLAUDE.md")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace mount support-docs
  $ nexus workspace mount support-docs --at ./ws --claude-md
  $ nexus workspace mount support-docs --read-only
  $ nexus workspace mount support-docs --shared      # mount the admin-shared copy
  $ nexus workspace mount support-docs --engine direct

When a slug names BOTH an org-owned workspace and an admin-shared one, the bare
slug resolves to the org-owned copy. The mount then warns and tells you the id
it picked; pass --shared to mount the shared copy instead.

The default mount point is ~/nexus/<org>/<slug>, where <org> is your
organization's name slugified (its id when the name is unknown), so two orgs
mounting one slug land in two directories. With no organization known at all
(a raw --api-key and no NEXUS_ORGANIZATION_ID) it is the org-less
~/nexus/<slug>. Mount points are still machine-wide: a directory another org's
live mount already occupies is refused — pick another with --at <path>.

Engines (auto picks per-OS):
  • webdav  — macOS native mount_webdav. No extra install, no macFUSE, no
              Recovery mode. Every request is authorised by Nexus, so a revoked
              key stops the drive at once. The default on macOS, and macOS-ONLY:
              asking for it on Linux or Windows is refused outright.
  • rclone  — rclone mounting the same Nexus gateway over FUSE. Authorised by
              Nexus per request like webdav, and it works with a raw --api-key.
              The default on Linux (FUSE built-in) and Windows (WinFsp). Retired
              on macOS, where webdav and direct cover it: asking for it there
              is refused, naming both.
  • direct  — rclone signing storage requests itself with a one-hour key that
              renews itself while you use the drive (no action from you; a
              renewal that fails posts a macOS notification and shows in
              "workspace status"). Faster, with a local write cache. Opt-in
              everywhere: macFUSE or FUSE-T on macOS, FUSE on Linux. Not
              available on Windows yet — its renewal hook runs through a POSIX
              shell. The drive dies at logout or restart — "workspace remount
              <slug>" brings it back and uploads what the dead mount had not
              sent.

Prerequisites for the engines that run rclone (rclone, direct):
  Linux    sudo -v ; curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    the OFFICIAL rclone binary from https://rclone.org/downloads/ —
           Homebrew's build refuses "rclone mount" — plus ONE FUSE layer:
           macFUSE (https://macfuse.github.io; a kernel extension, approved
           once in Recovery mode on Apple Silicon) or FUSE-T
           (https://www.fuse-t.org; no kernel extension). The mount checks all
           of this before it asks Nexus for anything, and names what is missing.

Notes:
  THE MOUNT POINT MUST BE EMPTY, and it is created for you if it does not
  exist. A non-empty directory is refused with "Mount point <path> is not
  empty" before anything is mounted — pick another with --at.
  THE WEBDAV DRIVE IS NOT POSIX. In-place edits are unsupported there: mv,
  sed -i and >> answer "Function not implemented". Read the file, transform it
  in memory, and write the whole file back. The direct engine's write cache
  supports them.
  workspaces:read IS ENOUGH TO MOUNT AND READ. Writing needs workspaces:write
  and DELETING NEEDS workspaces:delete, which write does not imply — a
  read-write WebDAV mount on a key without it fails every rm with a 403 while
  every cp succeeds. --read-only is a local guard, not the scope. The direct
  engine asks Nexus for the access up front instead: a key without both
  workspaces:write and workspaces:delete gets a READ-ONLY drive, and the
  command says so.
  A SUCCESSFUL MOUNT IS NOT A WORKING MOUNT. mount_webdav and rclone both
  report success on a mount whose gateway then refuses every read. Verify by
  reading one file you know is there.
  --shared PICKS THE ADMIN-SHARED COPY. Without it a slug that names both
  resolves to the org-owned one, and the command warns and prints the id it
  chose — read that line.
  --claude-md WRITES TO ./CLAUDE.md IN THE CURRENT DIRECTORY, creating it if
  needed and replacing only its managed nexus-workspace block.
  THE MOUNT OUTLIVES THIS COMMAND. rclone is detached, so the CLI exits while
  the mount stays up; it survives until "nexus workspace unmount", a logout or
  reboot, or the process being killed. Its log is under the CLI's log
  directory.
  The drive is LIVE and SHARED: teammates and agents see your changes within
  seconds, and you see theirs. Unmount with \`nexus workspace unmount <slug>\`.
  A CODE WORKSPACE IS MOUNTED READ-ONLY FOR YOU, AND --read-only CANNOT BE
  TURNED OFF. CODE is a read-only projection of a git project, so the server
  refuses every PUT, DELETE and MOVE against it; the WebDAV mount is made
  read-only up front, "workspace status" prints Mode ro, and the command prints
  why. Change the files by pushing to the git project instead. --json carries
  storageKind (DRIVE / CODE) and readOnlyReason ("kind" / "requested" /
  "granted" / null) — note that --json's OWN "kind" key is this command's
  OWNERSHIP field (org-owned / admin-shared), a different question with the
  same name.
  THE DIRECT ENGINE REFUSES A CODE WORKSPACE OUTRIGHT: its storage also holds
  engine-owned checkout generations, and a local write cache would accept saves
  the server then drops. The refusal comes before any mint when the workspace
  list answers; when the list is unreachable, the mint's own answer decides and
  the minted key is discarded. Mount it with the default engine instead.
  THE DIRECT ENGINE REFUSES A RAW --api-key / NEXUS_API_KEY: its hourly renewal
  re-reads the key from the profile that saved it, and a key that was never
  saved cannot be re-read. Run "nexus auth login" first. It also needs an
  organization resolved for the profile, and records it — later "auth use-org"
  switches never re-point a live drive.
  IF THE WORKSPACE LIST CANNOT BE FETCHED, THE KIND IS UNKNOWN AND THE MOUNT
  FALLS BACK TO READ-WRITE. Unknown is not "writable" — the server still
  refuses the writes, you just lose the warning. Re-mount once
  "nexus workspace list" works again.
  --json ADDS mountId, access AND pendingUploads FOR A DIRECT MOUNT (null
  otherwise): the per-mount id "workspace credential-process" takes, the access
  Nexus granted, and how many saves a previous mount left in the cache that are
  uploading now — the string "unknown" when that cache is there and cannot be
  read, which is NOT the same as null and must not be counted as zero.
  Never a bucket, a prefix or a credential value.
  MOUNTING TO ANSWER "IS THAT FILE THERE" IS THE EXPENSIVE WAY.
  "nexus workspace search <slug> --query <text>" runs server-side, needs no
  mount, no rclone and no FUSE, and answers in one call. Mount when you need
  the BYTES; search when you need to know what exists.`
    )
    .action(
      async (
        slug: string,
        opts: {
          at?: string;
          readOnly?: boolean;
          shared?: boolean;
          engine?: string;
          claudeMd?: boolean;
        }
      ) => {
        try {
          assertMountableSlug(slug);
          const engine = resolveEngine(opts.engine);
          const { apiKey, baseUrl, scope } = resolveAuth(program.optsWithGlobals());
          const mountPath = path.resolve(opts.at || defaultMountPath(slug, scope));

          // Guard scoped to this org only: a second org mounting the same slug
          // at a different path must succeed (NEX-2360). findMount matches the
          // active scope's own entries (incl. a pre-drift or legacy bare-slug
          // mount of this slug) but never another org's, so a still-live mount
          // blocks a duplicate while cross-org mounts stay independent. The
          // error names the owning org/profile so a real conflict is actionable.
          const mounts = readMounts();
          const existing = findMount(mounts, slug, scope);
          if (existing && isMountLive(existing.record)) {
            // A row naming no org may belong to a different organization, so
            // "unmount it first" would be an instruction to detach someone
            // else's live drive. `alreadyMountedMessage` owns which of the three
            // remedies fits, beside the other mount texts a test can assert.
            throw new Error(alreadyMountedMessage(slug, existing.record, scope));
          }

          // The guard above is org-scoped; the mount POINT is not. `--at` names
          // any directory, rows written before the default carried an org
          // segment sit at `~/nexus/<slug>`, and another org's row there is
          // invisible to the scoped lookup above. Two rows naming one mount
          // point corrupt each other: every OS action keys off `mountPath`, so
          // `unmount` under org A would detach org B's live drive there. Check
          // the path across ALL scopes; the stale rows this reports are dropped
          // below, as we take the path over.
          const claim = claimMountPoint(mounts, mountPath, {
            exceptKey: existing?.key,
            isLive: isMountLive
          });
          if (claim.blockedBy) {
            throw new Error(mountPointTakenMessage(mountPath, claim.blockedBy.record, slug));
          }

          // The engines' own local refusals, before the one network call below:
          // for direct, the pins its renewal needs, then the rclone build and
          // the FUSE layer the spawn needs, then the credential_process line its
          // renewal runs through; for rclone, the same rclone preflight. Each
          // names its fix, and nothing has been minted.
          const key = mountKey(scope, slug);
          const plan = planMount(engine, scope, key);

          // Resolve which copy of the slug we're about to mount. A slug can name
          // BOTH an org-owned workspace and an admin-shared one; the bare slug
          // resolves to the org-owned copy server-side, so without this the user
          // can silently mount the wrong drive (NEX-2362). Best-effort: a list
          // hiccup degrades to the legacy bare-slug mount rather than blocking.
          const client = createClient(program.optsWithGlobals());
          const { target, listError } = await resolveMountTargetDetailed(
            client,
            slug,
            !!opts.shared
          );

          // `--shared` is an explicit request, so never proceed unverified: a
          // missing list (target === null) means we couldn't confirm the shared
          // workspace exists, and a confirmed-absent one is a hard error. Either
          // way, mounting the `_shared/<slug>` path blindly would yield a live
          // mount that 404s on every request (esp. under rclone). The default
          // (bare-slug) path still degrades gracefully when the list is missing.
          if (opts.shared) {
            if (!target) {
              // RETHROW THE LIST'S OWN ERROR, never a fresh one. A null target
              // only ever means `workspaces.list()` threw, and that error already
              // knows what it was — unreachable API, a 401, a 5xx. Replacing it
              // with a plain `Error` here erased that: `handleError` had nothing
              // left to classify and stamped CLI_UNKNOWN_ERROR on a failure the
              // CLI had just diagnosed, which is the one thing an error document's
              // `code` must never do. The message below is worth less than the
              // cause, so the cause wins.
              throw (
                listError ??
                new Error(
                  `Couldn't verify workspaces for "${slug}" — fetching the workspace list failed.`
                )
              );
            }
            if (!target.shared) {
              throw new Error(
                `No admin-shared workspace has the slug "${slug}". ` +
                  `Run \`nexus workspace list\` to see available workspaces.`
              );
            }
          }

          const useShared = !!opts.shared || (!!target?.shared && !target.orgOwned);

          // A read-only KIND forces a read-only MOUNT. The server refuses every
          // mutating verb against a CODE workspace, so a read-write mount grants
          // nothing a mount_webdav read-only one does not — it only moves the
          // refusal from mount time to save time, where it arrives as a bare
          // "Permission denied" naming no workspace and no reason. Under a local
          // write cache it is worse: the save succeeds and the bytes are dropped
          // at upload — which is why the direct engine refuses the kind outright
          // rather than mounting it read-only.
          //
          // `--read-only` can only ADD this, never remove it: a user asking for
          // read-write on a projection is asking for something the server has
          // already decided to refuse.
          const storageKind = target?.kind;
          if (plan.engine === "direct" && storageKind !== undefined) {
            refuseCodeWorkspaceOnDirect(slug, storageKind);
          }
          const kindForcesReadOnly = storageKind !== undefined && isReadOnlyKind(storageKind);
          const requestedReadOnly = !!opts.readOnly || kindForcesReadOnly;

          // Drop a stale prior row (possibly under a legacy bare-slug or
          // pre-drift key) so we don't leave a duplicate entry for this same
          // workspace + org — legacy records migrate to a scoped key here.
          // Same for a dead row of ANOTHER scope that names this mount point:
          // it describes nothing live, and left in place it would come to
          // describe OUR mount — a later unmount of that row would detach a
          // drive it never mounted. Deleted only in memory here; the registry
          // file is untouched unless the mount below actually succeeds. A dead
          // DIRECT row is retired first: its unsent saves refuse a replacement
          // that would not upload them, and its session goes with it.
          const replacement = {
            engine,
            mountId: plan.engine === "direct" ? plan.mountId : null
          };
          if (existing) retireDeadRow(mounts, existing, replacement);
          for (const dead of claim.stale) {
            printWarning(
              `Reclaiming ${mountPath} from a stale mount record ` +
                `(${describeOwner(dead.record)}, workspace "${dead.record.slug}").`,
              "That mount is no longer live, so its registry entry is being replaced."
            );
            retireDeadRow(mounts, dead, replacement);
          }

          const davPath = useShared ? `_shared/${slug}` : slug;
          const mounted = await mountOnto(mountPath, () =>
            plan.engine === "direct"
              ? mountDirect({
                  slug,
                  mountPath,
                  readOnly: requestedReadOnly,
                  shared: useShared,
                  workspaceId: target?.workspaceId,
                  mountId: plan.mountId,
                  baseUrl,
                  pins: plan.pins,
                  awsConfig: plan.awsConfig,
                  client
                })
              : mountGateway({
                  engine: plan.engine,
                  slug,
                  davPath,
                  baseUrl,
                  apiKey,
                  mountPath,
                  readOnly: requestedReadOnly
                })
          );
          const { record } = mounted;
          // The EFFECTIVE mode: the flag, the kind, or a grade the server
          // lowered. The row records the REQUEST (`readOnly`) and the grant
          // (`access`) separately, so `remount` can ask for the same thing again
          // and come back read-write once a lost grant is restored; `modeOf`
          // joins the two for `workspace status`.
          const readOnly = requestedReadOnly || mounted.grantedReadOnly;

          // The mint's answer wins over the profile's saved copy — see
          // `refreshProfileOrgName`. One binding so the row, the JSON and the
          // printed summary cannot disagree about which name they show.
          const actingOrgName = mounted.serverOrgName ?? scope.orgName;

          // Org-scope the registry (NEX-2360): key by `<kind>:<acting-org>|<slug>`
          // and stamp the org/profile pinned at mount time, plus the ro/rw mode
          // (NEX-2372) and the org-owned-vs-admin-shared disambiguation
          // (NEX-2362), so `unmount`/`status` can tell which drive this is.
          const workspaceId = record.workspaceId ?? target?.workspaceId;
          mounts[key] = {
            ...record,
            shared: useShared,
            readOnly: requestedReadOnly,
            ...(scope.orgId ? { orgId: scope.orgId } : {}),
            ...(actingOrgName ? { orgName: actingOrgName } : {}),
            ...(scope.profile ? { profile: scope.profile } : {}),
            ...(workspaceId ? { workspaceId } : {})
          };
          writeMounts(mounts);

          let claudeMdTarget: string | null = null;
          if (opts.claudeMd) {
            claudeMdTarget = writeClaudeMdNote(slug, mountPath, readOnly);
          }

          const kind = useShared ? "admin-shared" : "org-owned";
          // Ambiguous = both copies exist. Warn whenever we resolved one while
          // the other was reachable, so the user can tell which drive they got.
          const ambiguous = !!target?.shared && !!target?.orgOwned;

          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  mounted: true,
                  slug,
                  engine,
                  mountPath,
                  kind,
                  shared: useShared,
                  workspaceId: workspaceId ?? null,
                  ambiguous,
                  pid: record.pid ?? null,
                  readOnly,
                  // Distinct keys on purpose: `readOnly` is what the mount IS,
                  // `readOnlyReason` is WHY. A script that only reads `readOnly`
                  // keeps working; one that wants to explain the mode to a human
                  // has the cause without re-deriving it from `storageKind`.
                  readOnlyReason: readOnlyReasonFor({
                    kindForcesReadOnly,
                    requested: !!opts.readOnly,
                    granted: mounted.grantedReadOnly
                  }),
                  // The STORAGE kind (DRIVE / CODE), null when the list could
                  // not be fetched. NOT the `kind` key beside it, which is this
                  // command's long-standing OWNERSHIP field (org-owned /
                  // admin-shared) and keeps its meaning for existing scripts.
                  storageKind: storageKind ?? null,
                  orgId: scope.orgId ?? null,
                  orgName: actingOrgName ?? null,
                  profile: scope.profile ?? null,
                  mountId: record.mountId ?? null,
                  access: record.access ?? null,
                  pendingUploads: mounted.pendingUploads,
                  claudeMd: claudeMdTarget
                },
                null,
                2
              )
            );
            return;
          }
          printSuccess(`Mounted "${slug}" at ${mountPath}`, {
            engine,
            kind,
            mode: readOnly ? "read-only" : "read-write",
            ...(actingOrgName || scope.orgId ? { org: actingOrgName ?? scope.orgId } : {}),
            ...(scope.profile ? { profile: scope.profile } : {})
          });
          if (kindForcesReadOnly) {
            console.log(
              color.yellow(
                `  Mounted READ-ONLY: "${slug}" is a ${storageKind} workspace — a read-only ` +
                  `projection of a git project, and the server refuses every write to it. ` +
                  `Mounting read-write would accept your saves locally and lose them. ` +
                  `Change the files by pushing to the git project instead.`
              )
            );
          }
          if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
          printPendingUploads(mounted.pendingUploads);
          if (ambiguous) {
            const idNote = workspaceId ? ` (id ${workspaceId})` : "";
            const counterpart = useShared
              ? `drop --shared to mount the org-owned copy`
              : `pass --shared to mount the admin-shared copy instead`;
            console.log(
              color.yellow(
                `  Note: "${slug}" exists as BOTH an org-owned and an admin-shared workspace. ` +
                  `Mounted the ${kind} one${idNote}; ${counterpart}.`
              )
            );
          }
          if (claudeMdTarget) {
            console.log(color.dim(`  Wrote workspace note to ${claudeMdTarget}`));
          }
          printMountFooter(engine, slug);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── remount ──────────────────────────────────────────────────────────────
  ws.command("remount")
    .description(
      "Mount a recorded workspace again — after a logout, a restart, or a mount that died"
    )
    .argument("<slug>", "Workspace slug (see `nexus workspace status`)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace remount support-docs

Notes:
  WHY IT EXISTS. A direct-engine drive is a detached rclone process, and a
  logout or a reboot kills it: the folder turns into an empty directory and
  "workspace status" reads Live no. This command mounts the SAME row again —
  same mount point, same copy, same organization and profile, the same mode
  ASKED FOR — with a fresh hour of access, so nothing has to be retyped.
  THE MODE IS RE-REQUESTED, NOT REPLAYED. A drive that came back read-only
  because Nexus granted less than it asked for asks for read-write again here,
  so it is read-write once the grant is restored; --read-only and a CODE kind
  stay read-only, as recorded.
  IT UPLOADS WHAT THE DEAD MOUNT HAD NOT SENT. Saves the previous mount left
  in its cache are queued again on the same cache directory; the command
  prints how many. A remount that would come back READ-ONLY while such saves
  exist is refused, because they could never upload — the refusal names the
  cache to copy them from and how to discard them.
  IT REFUSES A LIVE MOUNT. "already mounted at <path>" means there is nothing
  to do; unmount first if you want a fresh one.
  IT RESOLVES BY ACTING ORG, like "unmount": when the active org holds no row
  for the slug, the error lists the orgs that do.
  A WEBDAV OR RCLONE ROW IS REMOUNTED THE ORDINARY WAY — webdav with a fresh
  mount token, rclone with the current key. A row this platform cannot run
  (webdav off macOS, rclone on macOS) is refused, naming the engine to use.
  IT NEEDS A VALID KEY AND THE NETWORK: the drive is minted again. A direct
  row is minted under the profile it RECORDED; an --api-key on this command is
  not used for it.`
    )
    .action(async (slug: string) => {
      try {
        assertMountableSlug(slug);
        const globals = program.optsWithGlobals();
        const { apiKey, baseUrl, scope } = resolveAuth(globals);
        const mounts = readMounts();
        const found = findMount(mounts, slug, scope);
        if (!found) {
          const candidates = findMountsBySlug(mounts, slug);
          if (candidates.length > 0) {
            throw new Error(ownedElsewhereMessage(slug, candidates, scope, "recorded"));
          }
          throw new Error(
            `No mount of "${slug}" is recorded. Mount it: nexus workspace mount ${slug}`
          );
        }
        const { key, record } = found;
        if (isMountLive(record)) {
          throw new Error(`"${slug}" is already mounted at ${record.mountPath}. Nothing to do.`);
        }
        // 🔴 VALIDATED, not trusted. `mount` reaches its engine through
        // `resolveEngine`/`isEngine`; `remount` reads it off a registry row that
        // `readMounts` parses and CASTS. An unrecognised value — a row written by
        // a newer CLI, a hand edit — walked past `refuseEngineOffPlatform`'s
        // if-chain and reached the dispatch switch, whose `satisfies never` arm
        // RETURNS at runtime. `mounted.record` was then undefined, the spread
        // wrote nothing, the registry was rewritten, and the command printed
        // "Remounted" having mounted nothing — a False Green on the one verb
        // whose job is bringing a dead drive back.
        const engine = record.engine;
        if (!isEngine(engine)) {
          throw invalidInput(
            `The registry row for "${slug}" names engine "${String(engine)}", which this CLI does not have. It was probably written by a newer one.`,
            `Run: nexus workspace unmount ${slug}, then mount it again with this CLI — or upgrade: npm install -g @agent-nexus/cli@latest.`
          );
        }
        refuseEngineOffPlatform(engine, "remount");
        // 🔴 A row written before the mode was recorded says NOTHING about what
        // was asked for, and `status` prints `Mode ?` for exactly that reason.
        // `?? false` would resolve that silence to the MORE PERMISSIVE answer:
        // a drive deliberately mounted `--read-only` comes back writable, and
        // the row is then rewritten claiming `rw`, so the honest unknown is gone
        // too. Nobody is granted anything they lack — the server still grades
        // the credential — but a guardrail the caller chose disappears without
        // a word. The silence is refused instead, and the pair that can state a
        // mode is named.
        if (record.readOnly === undefined) {
          throw invalidInput(
            `The registry row for "${slug}" records no read-only mode — it was written before the CLI stored one, so remount cannot know whether you asked for a read-only drive.`,
            `Run: nexus workspace unmount ${slug}, then nexus workspace mount ${slug} (add --read-only to keep it read-only).`
          );
        }
        const requestedReadOnly = record.readOnly;
        const shared = record.shared ?? false;
        detachDeadMount(record);

        const mounted = await mountOnto(record.mountPath, () =>
          remountRecord({
            engine,
            slug,
            record,
            key,
            scope,
            baseUrl,
            apiKey,
            shared,
            readOnly: requestedReadOnly,
            globals
          })
        );
        const readOnly = requestedReadOnly || mounted.grantedReadOnly;
        // A remount mints too, so it hears the org's current name and the row
        // stops carrying whatever the name was when the drive was first mounted.
        const actingOrgName = mounted.serverOrgName ?? record.orgName;
        mounts[key] = {
          ...record,
          ...mounted.record,
          readOnly: requestedReadOnly,
          ...(actingOrgName ? { orgName: actingOrgName } : {})
        };
        writeMounts(mounts);

        if (isJsonMode()) {
          console.log(
            JSON.stringify(
              {
                remounted: true,
                slug,
                engine,
                mountPath: record.mountPath,
                readOnly,
                pid: mounted.record.pid ?? null,
                mountId: mounted.record.mountId ?? null,
                access: mounted.record.access ?? null,
                pendingUploads: mounted.pendingUploads
              },
              null,
              2
            )
          );
          return;
        }
        printSuccess(`Remounted "${slug}" at ${record.mountPath}`, {
          engine,
          mode: readOnly ? "read-only" : "read-write",
          ...(actingOrgName || record.orgId ? { org: actingOrgName ?? record.orgId } : {}),
          ...(record.profile ? { profile: record.profile } : {})
        });
        if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
        printPendingUploads(mounted.pendingUploads);
        printMountFooter(engine, slug);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── unmount ──────────────────────────────────────────────────────────────
  ws.command("unmount")
    .alias("umount")
    .description("Unmount a previously mounted workspace")
    .argument("<slug>", "Workspace slug")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace unmount support-docs
  $ nexus workspace umount support-docs      # same command

Notes:
  IT NEEDS NO AUTH AND MAKES NO API CALL. This is a local operation on the
  mount registry, so it works with no profile configured and after a key has
  been revoked.
  IT RESOLVES BY ACTING ORG FIRST. The same slug can be mounted for several
  organizations; when the active org owns none of them the error LISTS the
  candidates and tells you to switch profile or pass --profile, instead of
  saying the mount does not exist.
  UNSAVED WORK IN FLIGHT IS NOT FLUSHED FOR YOU. Writes propagate within
  seconds — let a large copy finish before unmounting. On a direct-engine
  drive the saves not yet uploaded are KEPT in the drive's cache and counted:
  "N file(s) not yet uploaded; nexus workspace mount <slug> --engine direct
  uploads them" — the same workspace mounted again under the same organization
  and profile reuses that cache and drains it. The cache directory is deleted
  only when it holds nothing.
  A DIRECT-ENGINE DRIVE'S ACCESS FILES ARE DELETED, AND ITS LAST KEY IS NOT.
  The session and the renewal config go; the storage key minted last stays
  valid until the expiry the command prints (an hour at most) — there is no
  revoke call for it. --json carries that instant as accessValidUntil, and
  the kept-save count as pendingUploads; both are null on other engines, and
  pendingUploads is the string "unknown" when the cache cannot be read.
  THE MOUNT-POINT DIRECTORY SURVIVES, EMPTY, AND YOU MUST REMOVE IT YOURSELF.
  Since "workspace mount" refuses a mount point that is not empty, the leftover
  directory is usually fine — but it is what bites you when something later
  writes into it while unmounted. Run "rmdir" on the path you passed to --at.
  A mount point with no record answers "No mount recorded for <slug>". If the
  OS still has it mounted, unmount it with the platform tool (umount /
  fusermount -u) — this command only knows what it recorded.
  Verify with "nexus workspace status": the row is gone.`
    )
    .action((slug: string) => {
      try {
        const mounts = readMounts();
        // Scope to the acting org so the right per-org mount is targeted when
        // the same slug is mounted for multiple orgs (NEX-2360). Best-effort:
        // works with no configured profile, falling back to an UNOWNED slug
        // match only — an owned row is never detached on an unresolved scope.
        const scope = resolveScopeBestEffort(program.optsWithGlobals());
        const found = findMount(mounts, slug, scope);
        if (!found) {
          // Never say "No mount recorded" when the slug IS mounted — just for a
          // different (or ambiguous) org. `unmountMissMessage` owns which remedy
          // fits, because which one is TRUE depends on whether the candidates
          // have an owner to switch to at all.
          const candidates = findMountsBySlug(mounts, slug);
          if (candidates.length > 0) {
            throw new Error(unmountMissMessage(slug, candidates, scope));
          }
          throw new Error(`No mount recorded for "${slug}". See \`nexus workspace status\`.`);
        }
        const { key, record } = found;

        // OS-level unmount detaches both native WebDAV and rclone-FUSE cleanly.
        unmountPath(record.mountPath);
        // rclone leaves a detached process; reap it if the unmount didn't.
        killRecordedProcess(record);
        const leftovers = record.engine === "direct" ? removeDirectSession(record) : null;
        delete mounts[key];
        writeMounts(mounts);

        if (isJsonMode()) {
          console.log(
            JSON.stringify(
              {
                unmounted: true,
                slug,
                pendingUploads: jsonPendingUploads(leftovers?.pendingUploads),
                accessValidUntil: leftovers?.accessValidUntil ?? null
              },
              null,
              2
            )
          );
          return;
        }
        printSuccess(`Unmounted "${slug}" (${record.mountPath})`);
        if (leftovers !== null && leftovers.pendingUploads > 0) {
          console.log(
            color.yellow(
              `  ${describePendingUploads(leftovers.pendingUploads)} file(s) not yet uploaded; ` +
                `nexus workspace mount ${slug} --engine direct uploads them.`
            )
          );
        }
        if (leftovers?.accessValidUntil) {
          console.log(
            color.dim(
              `  The last minted access stays valid until ${leftovers.accessValidUntil}; AWS has no revoke call for it.`
            )
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── status ─────────────────────────────────────────────────────────────────
  ws.command("status")
    .description("Show locally recorded mounts — a local read, never a server check")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace status
  $ nexus workspace status --json

Notes:
  LIVE REFLECTS THE MOUNT ONLY, NEVER THE SERVER. It is a process check for
  the rclone and direct engines (the recorded pid must still be an rclone
  mount) and a mount-table check for the native engine, so a row can read Live
  yes and still fail every read when the WebDAV gateway refuses, the key was
  revoked or the workspace was deleted. CONFIRM BY READING ONE KNOWN FILE.
  IT SHOWS EVERY ORG'S MOUNTS, not just the active one, and needs no auth — it
  reads the local registry and, for a direct mount, that mount's own files.
  "?" IS "NOT RECORDED", NOT "NONE". Org prints "?" when the mount was made
  with a raw --api-key and no NEXUS_ORGANIZATION_ID, and Mode prints "?" on a
  mount recorded before the mode was tracked — that mount may be read-write.
  Profile prints "-" in the same situation, not "?".
  Under --json the same fields are null rather than "?" / "-", so a script can
  tell "unknown" from a literal value.
  A DIRECT MOUNT GETS THREE MORE COLUMNS, FROM LOCAL READS ONLY. Expires is
  when its current hour of access ends ("in 41m", "expired 3m ago" — an expired
  drive that is still running renews itself on the next click). Refresh is
  exactly one of: "ok <ago>" · "stale: expired <ago>, refreshes on next
  access" (or ", mount is not live — remount" when Live is no) · "failed
  <ago>: <what> — <fix>" · "broken: <what> — run: <fix>". Pending is how many
  saves have not reached the workspace yet. Other
  engines print "-"; under --json the three are expiresAt, refresh
  {outcome, at, reason, transient, fix} and pendingUploads, null elsewhere.
  mountId IS PRINTED UNDER --json ONLY: the direct engine's per-mount id, the
  operand "nexus workspace credential-process" takes. Null on other engines.
  Never a bucket, a prefix or a credential value, on either channel.
  Mode is what the mount was CREATED with. It does not re-derive the scopes the
  key actually holds, so Mode rw on a key without workspaces:write is possible.
  "No workspaces mounted." means the registry is empty. It does not mean the OS
  has nothing mounted, and it exits 0 — nothing is recorded, so nothing is wrong.
  THE EXIT CODE CARRIES live AND Refresh. Any recorded mount reading no, and
  any LIVE direct mount whose last renewal failed for a reason the next click
  cannot cure or whose renewal path is broken, makes this exit non-zero and
  names the rows, so a script can gate on a drive it depends on. A dead row is
  named once, as dead: its remount rewrites what a broken renewal path needs.
  A failed renewal that is TRANSIENT (offline, a slow answer) is printed and
  exits 0.
  It is still a LOCAL check: a 0 means every recorded mount is mounted and
  renewable, never that the server still has the workspace. Under --json a
  non-zero exit REPLACES the rows with the error document.`
    )
    .action(() => {
      try {
        const mounts = readMounts();
        const now = new Date();
        const profileExists = profilePresence();
        const rows = Object.values(mounts).map((m) => statusRow(m, now, profileExists));
        const records = rows.map((row) => row.json);
        // 🚨 `live` IS THE ONE FACT A SCRIPT COMES HERE FOR, and the exit code
        // never said it. This command's own help already warns that a mount can
        // read Live yes and still fail every read — so the exit code is the only
        // cheap way a caller learns a drive it depends on is GONE, and it always
        // said "fine". A direct mount whose renewal cannot succeed is the same
        // fact one hour early.
        //
        // ⚠️ AN EMPTY REGISTRY IS NOT A FAILURE. "No workspaces mounted." means
        // nothing is recorded here, which the help is careful to say is not a
        // claim about what the OS has mounted. Exiting non-zero on it would
        // refuse a machine that is doing exactly what was asked of it.
        const dead = records.filter((r) => r.live === "no");
        // A dead row is reported once, as dead: its remount rewrites the session
        // and the config, so whatever else is wrong with it goes with the fix.
        const broken = rows
          .filter(
            (row) =>
              row.json.live === "yes" &&
              row.health !== null &&
              refreshVerdictIsUnhealthy(row.health.verdict)
          )
          .map((row) => ({ ...row.json, refresh: row.table.refresh }));
        const unhealthy = dead.length > 0 || broken.length > 0;

        if (isJsonMode()) {
          // Under --json a failure is the error document and NOTHING else.
          // Printing the rows and then refusing takes stdout with a document
          // that parses cleanly and never says a mount is gone — `error-masked`
          // in `json-one-document.scan.ts`.
          if (unhealthy) {
            process.exitCode = reportUnhealthyMounts(dead, broken);
          } else {
            console.log(JSON.stringify(records, null, 2));
          }
          return;
        }
        if (records.length === 0) {
          console.log(color.dim("No workspaces mounted."));
          return;
        }
        // `records` keeps the nullable raw fields for `--json`; the table needs
        // rendered placeholders. No cast: `printTable` checks column keys
        // against the row type now, and the cast would take this call site back
        // out of that check.
        const table = rows.map((row) => row.table);
        const directColumns: Column<(typeof table)[number]>[] = rows.some(
          (row) => row.health !== null
        )
          ? [
              { key: "expires", label: "Expires" },
              { key: "refresh", label: "Refresh" },
              { key: "pending", label: "Pending" }
            ]
          : [];
        printTable(table, [
          { key: "slug", label: "Slug" },
          { key: "org", label: "Org" },
          { key: "profile", label: "Profile" },
          { key: "mode", label: "Mode" },
          { key: "engine", label: "Engine" },
          { key: "kind", label: "Kind" },
          { key: "mountPath", label: "Mount point" },
          { key: "live", label: "Live" },
          ...directColumns
        ]);

        // The table above already shows a human which row reads "no"; the exit
        // code is the half a script reads, and it said nothing.
        if (unhealthy) {
          process.exitCode = reportUnhealthyMounts(dead, broken);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── credential-process ────────────────────────────────────────────────────
  registerWorkspaceCredentialProcessCommand(ws, program);

  // Bound LAST, after every option exists — see `bindCommand`. The seven
  // Public API v1 subcommands are bound; mount / unmount / status speak to this
  // machine's own registry and call no v1 route at all.
  bindCommand(list, WORKSPACE_LIST_CONTRACT);
  bindCommand(search, WORKSPACE_SEARCH_CONTRACT);
  bindCommand(create, WORKSPACE_CREATE_CONTRACT);
  bindCommand(rename, WORKSPACE_RENAME_CONTRACT);
  bindCommand(remove, WORKSPACE_DELETE_CONTRACT);
  bindCommand(restore, WORKSPACE_RESTORE_CONTRACT);
}

/** OS-native unmount of a mount point. Best-effort across platforms/engines. */
function unmountPath(mountPath: string): void {
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
