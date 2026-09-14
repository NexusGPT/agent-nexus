import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  type MintWorkspaceMountCredentialsBody,
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import type { FailureCause } from "./errors";
import { writeSecretFile } from "./util/secret-file";
import {
  ensureStateSubdir,
  type MountAccess,
  type RcloneEngine,
  STATE_DIR
} from "./workspace-mounts";

// ── Direct-engine mount: the pure half ────────────────────────────────────────
//
// The direct engine is rclone signing S3 requests itself with a one-hour STS
// session the CLI mints from the API key. Everything rclone needs to find that
// session, and everything the `workspace credential-process` helper needs to
// renew it, lives in ONE owner-only directory per mount:
//
//   ~/.nexus-mcp/mount-credentials/<mountId>/session.json   the triplet + pins
//   ~/.nexus-mcp/mount-credentials/<mountId>/aws.config     the credential_process line
//   ~/.nexus-mcp/cache/<mountId>/                            rclone's VFS cache
//
// The mount id is a function of the registry key, so `mount`, `remount` and the
// helper all find the same three paths — and rclone, restarted with the same
// cache directory and the same remote definition, drains the saves a dead mount
// left behind.
//
// This module is spawn-free and reads no environment of its own: every function
// takes what it needs as a parameter, so `workspace-mounts.test.ts` can pin each
// one without a FUSE, a network or a real home directory. The command file owns
// the spawns, the clock and the exit codes.

/** The first 16 hex digits of a sha256 — one id per registry key. */
const MOUNT_ID_RE = /^[0-9a-f]{16}$/;

/** Where every direct mount keeps its session and credential_process config. */
export const MOUNT_CREDENTIALS_DIR = path.join(STATE_DIR, "mount-credentials");

/** Where rclone keeps a direct mount's VFS cache — under the 0700 state tree. */
export const MOUNT_CACHE_DIR = path.join(STATE_DIR, "cache");

/**
 * Written the first time this machine mounts a direct drive, so the note about
 * allowing Terminal's notifications prints once rather than on every mount.
 */
export const DIRECT_MOUNT_INTRO_MARKER = path.join(STATE_DIR, "direct-mount-intro");

/**
 * How early the helper reports `Expiration` relative to the real `expiresAt`.
 *
 * The AWS SDK reruns `credential_process` on the first request AT OR AFTER the
 * reported instant and adds no margin of its own, so this lead is the whole
 * window in which an upload already in flight finishes on credentials that are
 * still valid. Five minutes is also the helper's own freshness test: a session
 * inside the lead is stale and re-minted, never served.
 */
export const EXPIRATION_LEAD_MS = 5 * 60 * 1000;

/**
 * After a failed refresh the helper refuses for this long WITHOUT calling the
 * backend. Every Finder poll on a broken mount reruns the helper, and each run
 * that reached the server would be one POST — a listing of a hundred files
 * would be a hundred mints against a key that has already been refused once.
 */
export const REFRESH_COOLDOWN_MS = 30 * 1000;

/**
 * The wall-clock budget for one helper run's backend attempts.
 *
 * rclone's AWS SDK kills `credential_process` at 60 s (processcreds
 * `DefaultTimeout`), and a kill lands before the outcome is recorded — no
 * `lastRefresh`, no cooldown, no notification, and the next S3 request hangs
 * for the same minute again. So every attempt must END inside this budget,
 * leaving the rest of the minute for node's start-up, the record and the
 * document.
 */
export const REFRESH_BUDGET_MS = 45 * 1000;

/** Attempts against a transient failure — wake-from-sleep Wi-Fi lag, nothing else. */
export const REFRESH_ATTEMPTS = 3;

/** The pause between two attempts. */
export const REFRESH_RETRY_DELAY_MS = 2000;

/**
 * May one more attempt start after `attempt` failed?
 *
 * Only while the next one would end inside {@link REFRESH_BUDGET_MS}: the
 * pause before it plus the client's own timeout, on top of what has elapsed.
 * The attempt count is a ceiling for failures that come back at once (a
 * refused connection); the budget is the bound for ones that hang until the
 * client gives up (a backend that accepts TCP and never answers).
 */
export function refreshMayRetry(input: {
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
}): boolean {
  if (input.attempt >= REFRESH_ATTEMPTS) return false;
  return input.elapsedMs + REFRESH_RETRY_DELAY_MS + input.timeoutMs <= REFRESH_BUDGET_MS;
}

/** Repeat a transition notification no sooner than this. */
export const NOTIFICATION_DEBOUNCE_MS = 10 * 60 * 1000;

/**
 * The longest volume name the drive is labelled with. rclone sanitises only its
 * DEFAULT volname, so a name the CLI passes is the CLI's to bound.
 */
export const VOLUME_NAME_MAX_CHARS = 64;

/** The `[profile …]` header rclone's AWS SDK selects through `AWS_PROFILE`. */
const AWS_PROFILE_PREFIX = "nexus-mount-";

export function isMountId(value: string): boolean {
  return MOUNT_ID_RE.test(value);
}

/**
 * The per-mount id: 16 hex digits of the sha256 of the registry key, so one
 * org + slug maps to one session directory and one rclone cache directory on
 * every mount and remount. A hash rather than the key itself because the key
 * carries a base URL, and a directory name must not.
 */
export function mountIdFor(registryKey: string): string {
  return createHash("sha256").update(registryKey).digest("hex").slice(0, 16);
}

export function awsProfileFor(mountId: string): string {
  return `${AWS_PROFILE_PREFIX}${mountId}`;
}

export interface SessionPaths {
  readonly dir: string;
  readonly sessionFile: string;
  readonly awsConfigFile: string;
  readonly cacheDir: string;
  /** Which copy of the slug the cache belongs to — see {@link cacheProvenanceRefusal}. */
  readonly cacheOwnerFile: string;
}

/**
 * The five paths one mount owns. `mountId` is CHECKED here rather than trusted,
 * because two of these paths are handed to `fs.rmSync(…, { recursive: true,
 * force: true })` and one of the callers reads the id out of
 * `workspace-mounts.json` — a file `readMounts` parses and casts, so the
 * `mountId: string` on `MountRecord` is a claim about a JSON file, not a fact.
 * A row carrying `../../..` would resolve those deletes outside the state
 * directory. This is the same guard, for the same reason, that
 * `assertMountableSlug` already applies to a slug before it reaches `path.join`.
 */
export function sessionPathsFor(mountId: string): SessionPaths {
  if (!isMountId(mountId)) {
    throw new Error(
      `Refusing to use "${mountId}" as a mount id: it is not 16 hex digits, so the registry row ` +
        "is corrupt. Check it with: nexus workspace status"
    );
  }
  const dir = path.join(MOUNT_CREDENTIALS_DIR, mountId);
  const cacheDir = path.join(MOUNT_CACHE_DIR, mountId);
  return {
    dir,
    sessionFile: path.join(dir, "session.json"),
    awsConfigFile: path.join(dir, "aws.config"),
    cacheDir,
    cacheOwnerFile: path.join(cacheDir, "owner.json")
  };
}

/**
 * Which COPY of a slug a cache directory belongs to.
 *
 * 🔴 THE MOUNT ID DOES NOT SAY. It is a hash of the registry key,
 * `<kind>:<id>|<slug>`, and a slug can name two different workspaces at once —
 * the organization's own and the ownerless admin-shared one. They differ only
 * in a field the key never carries, so both hash to ONE mount id and therefore
 * ONE cache directory.
 *
 * That is only dangerous because a dirty cache deliberately OUTLIVES its mount:
 * `unmount` keeps a cache holding unsent saves, since it is their only copy, and
 * the next direct mount on the same id drains it. If that next mount is the
 * other copy, rclone is pointed at the other BUCKET — the platform one — and the
 * private workspace's unsent bytes upload into the shared library every
 * organization can read. Nothing else catches it: the live-mount guard needs a
 * row, and a clean unmount leaves none.
 *
 * So the cache states its own provenance, and a mount that disagrees is refused
 * rather than drained. The file sits INSIDE the cache directory so it shares its
 * lifetime exactly: kept while saves are pending, removed with the empty cache.
 */
export interface CacheOwner {
  readonly shared: boolean;
}

export function readCacheOwner(cacheOwnerFile: string): CacheOwner | null {
  let raw: string;
  try {
    raw = fs.readFileSync(cacheOwnerFile, "utf-8");
  } catch {
    // Absent, or unreadable. Neither states a provenance, so neither refuses:
    // every cache written before this file existed is in that state, and
    // refusing them all would strand saves this very guard exists to protect.
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && typeof parsed.shared === "boolean"
      ? { shared: parsed.shared }
      : null;
  } catch {
    return null;
  }
}

export function writeCacheOwner(cacheOwnerFile: string, owner: CacheOwner): void {
  fs.mkdirSync(path.dirname(cacheOwnerFile), { recursive: true });
  writeSecretFile(cacheOwnerFile, JSON.stringify(owner) + "\n");
}

/**
 * The refusal when a leftover cache belongs to the OTHER copy of this slug, or
 * null when it may be reused. Silent on an empty cache: with nothing to drain
 * there is nothing to misdeliver, and the stale marker is simply overwritten.
 */
export function cacheProvenanceRefusal(
  paths: Pick<SessionPaths, "cacheDir" | "cacheOwnerFile">,
  shared: boolean,
  slug: string
): string | null {
  const owner = readCacheOwner(paths.cacheOwnerFile);
  if (owner === null || owner.shared === shared) return null;
  if (!cacheHoldsEntries(paths.cacheDir)) return null;
  const held = owner.shared ? "the admin-shared" : "your organization's own";
  const wanted = shared ? "the admin-shared" : "your organization's own";
  return (
    `The cache for "${slug}" holds unsent saves from ${held} copy, and this mount is ${wanted} copy. ` +
    `Uploading them here would put them in the wrong workspace.`
  );
}

// ── The session file ──────────────────────────────────────────────────────────

export const REFRESH_OUTCOMES = ["ok", "failed"] as const;
export type RefreshOutcome = (typeof REFRESH_OUTCOMES)[number];

/**
 * Why a refresh failed. A CLOSED union: the CLI's own failure vocabulary plus
 * the two refusals the helper makes on a mint that SUCCEEDED but must not be
 * served — a lower grade than the mount was made with, or a different
 * workspace behind the same slug.
 */
export type RefreshFailureReason = FailureCause | "access-downgraded" | "workspace-replaced";

/** A refresh that failed always says why; one that succeeded has nothing to add. */
export type RefreshRecord =
  | { readonly at: string; readonly outcome: "ok" }
  | { readonly at: string; readonly outcome: "failed"; readonly reason: RefreshFailureReason };

export type FailedRefresh = Extract<RefreshRecord, { outcome: "failed" }>;

/**
 * What `session.json` holds. `version: 1` is a READ contract: a later CLI that
 * changes the shape bumps it and keeps reading this one, because the file
 * outlives the binary that wrote it.
 *
 * `profile`, `baseUrl` and `orgId` are the pins that make a refresh act on the
 * tenant the mount was made for: the helper resolves the API key through the
 * named profile and hands `orgId` to the client as an override, so neither
 * `auth use-org` nor an exported `NEXUS_ORGANIZATION_ID` after mounting can
 * re-point it. All three are REQUIRED and non-empty — an absent pin would fall
 * through to whatever the shell or the active profile selects at refresh time,
 * which is the re-pointing the pin exists to refuse. The mint route resolves an
 * organization on every call, so there is always one to record. The API key
 * itself is never copied here — `config.json` stays its only home.
 */
export interface MountSession {
  readonly version: 1;
  readonly mountId: string;
  readonly profile: string;
  readonly baseUrl: string;
  /** The organization the mount was minted under, as the profile resolved it then. */
  readonly orgId: string;
  readonly workspace: {
    readonly id: string;
    readonly slug: string;
    readonly shared: boolean;
  };
  /** The access the server GRANTED at mount time — the floor a refresh must meet. */
  readonly access: MountAccess;
  /** The Finder label the drive was mounted with; the notification title. */
  readonly volumeName: string;
  /**
   * No bucket, prefix or region: rclone holds those in its process environment
   * from mount time, and a refresh changes none of them. The file carries only
   * what the helper needs to mint again and to hand the triplet back.
   */
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
  };
  /** ISO 8601 — when AWS stops honouring the triplet. */
  readonly expiresAt: string;
  /** ISO 8601 — when the triplet was minted. */
  readonly mintedAt: string;
  readonly lastRefresh?: RefreshRecord;
  /**
   * When each outcome was last announced on the desktop, keyed BY OUTCOME.
   * A single "last notification" record cannot debounce anything: a
   * transition is by definition to the other outcome, so the record always
   * names the outcome that is not the one about to be announced. Keeping one
   * instant per outcome is what lets a repeated ok→failed inside
   * {@link NOTIFICATION_DEBOUNCE_MS} stay quiet.
   */
  readonly lastNotified?: NotifiedAt;
}

/** ISO 8601 instants, one per outcome that has ever been announced. */
export type NotifiedAt = Partial<Record<RefreshOutcome, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A pin is a string with something in it: `""` reads as unset downstream. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Every grade, ranked — the gate below and `accessIsLower` read one table. */
const ACCESS_RANK = { read: 0, "read-write": 1 } as const satisfies Record<MountAccess, number>;

export function isMountAccess(value: unknown): value is MountAccess {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCESS_RANK, value);
}

function isRefreshRecord(value: unknown): value is RefreshRecord {
  if (!isRecord(value) || !isString(value.at)) return false;
  if (value.outcome === "ok") return value.reason === undefined;
  return value.outcome === "failed" && isRefreshFailureReason(value.reason);
}

function isOptionalRefreshRecord(value: unknown): value is RefreshRecord | undefined {
  return value === undefined || isRefreshRecord(value);
}

function isRefreshOutcome(value: string): value is RefreshOutcome {
  return REFRESH_OUTCOMES.some((outcome) => outcome === value);
}

function isOptionalNotifiedAt(value: unknown): value is NotifiedAt | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([outcome, at]) => isRefreshOutcome(outcome) && isString(at));
}

/**
 * A structural check rather than a schema parse: the CLI ships with commander
 * as its only runtime dependency, so Zod is not available to it. Every field
 * is tested, and a file failing any one of them is `malformed` rather than a
 * crash — a truncated write is the ordinary way that happens.
 */
export function isMountSession(value: unknown): value is MountSession {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isString(value.mountId) || !isMountId(value.mountId)) return false;
  if (!isNonEmptyString(value.profile) || !isNonEmptyString(value.baseUrl)) return false;
  if (!isNonEmptyString(value.orgId)) return false;
  const workspace = value.workspace;
  if (!isRecord(workspace)) return false;
  if (!isString(workspace.id) || !isString(workspace.slug)) return false;
  if (typeof workspace.shared !== "boolean") return false;
  if (!isMountAccess(value.access) || !isNonEmptyString(value.volumeName)) return false;
  const credentials = value.credentials;
  if (!isRecord(credentials)) return false;
  if (!isString(credentials.accessKeyId) || !isString(credentials.secretAccessKey)) return false;
  if (!isString(credentials.sessionToken)) return false;
  if (!isString(value.expiresAt) || !isString(value.mintedAt)) return false;
  return isOptionalRefreshRecord(value.lastRefresh) && isOptionalNotifiedAt(value.lastNotified);
}

export type SessionRead =
  | { readonly ok: true; readonly session: MountSession }
  | { readonly ok: false; readonly why: "missing" | "malformed" };

function isNoSuchFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Read a mount's session. Never throws: an absent or damaged file is a typed
 * miss. Only an absent file is `missing` — one the process cannot read (a
 * directory in its place, somebody else's ownership) is a damaged mount, not an
 * unrecorded one, and is reported as such.
 */
export function readSession(mountId: string): SessionRead {
  let text: string;
  try {
    text = fs.readFileSync(sessionPathsFor(mountId).sessionFile, "utf-8");
  } catch (error) {
    return { ok: false, why: isNoSuchFile(error) ? "missing" : "malformed" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (!isMountSession(parsed) || parsed.mountId !== mountId) return { ok: false, why: "malformed" };
  return { ok: true, session: parsed };
}

/**
 * Write a mount's session at 0600, ATOMICALLY: the bytes land in a sibling
 * temp file through `writeSecretFile` and are renamed over the live one, so a
 * helper killed mid-write (rclone's AWS SDK kills it at 60 s) leaves the
 * previous session intact rather than a truncated file every later run reads
 * as malformed. The rename keeps the temp file's mode.
 */
export function writeSession(session: MountSession): void {
  const paths = sessionPathsFor(session.mountId);
  ensureStateSubdir(MOUNT_CREDENTIALS_DIR);
  const temp = `${paths.sessionFile}.${process.pid}.tmp`;
  writeSecretFile(temp, JSON.stringify(session, null, 2) + "\n");
  fs.renameSync(temp, paths.sessionFile);
}

// ── aws.config: the credential_process line ───────────────────────────────────

export interface AwsConfigInput {
  /** The node binary that runs the CLI — `process.execPath` at mount time. */
  readonly execPath: string;
  /** The CLI's entry file — `process.argv[1]` at mount time. */
  readonly entry: string;
  readonly mountId: string;
}

/**
 * Why a path cannot be written into the credential_process value.
 *
 * The AWS SDK's ini reader tokenises the value before the shell sees it: a
 * double quote ends a quoted token, a newline ends the line, and a space or tab
 * followed by `#` or `;` starts a comment that swallows the rest. The SDK then
 * hands the value to `sh -c`, where `$`, a backtick and a backslash are still
 * interpreted inside the double quotes the paths are written in. A path
 * carrying any of these would produce a line that parses to a different
 * command than the one written, so the writer refuses instead.
 */
export type AwsConfigRefusal = {
  readonly field: "execPath" | "entry";
  readonly because: "double-quote" | "newline" | "comment-start" | "shell-special";
};

export type AwsConfigResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly refusal: AwsConfigRefusal };

function awsConfigRefusalFor(value: string): AwsConfigRefusal["because"] | null {
  if (value.includes('"')) return "double-quote";
  if (/[\r\n]/.test(value)) return "newline";
  if (/[ \t][#;]/.test(value)) return "comment-start";
  if (/[$`\\]/.test(value)) return "shell-special";
  return null;
}

function realpathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/**
 * The node binary to write into the credential_process line: the `node` on
 * PATH that IS this process's binary, when there is one, else the binary
 * itself.
 *
 * `process.execPath` is already resolved through every symlink, so under
 * Homebrew or a version manager it names a versioned directory
 * (`…/Cellar/node/24.6.0/bin/node`) that the next node upgrade deletes — and
 * with it every direct mount's renewal, silently, at its next hour. The PATH
 * entry (`/opt/homebrew/bin/node`) is the spelling that survives the upgrade:
 * the manager repoints it. It is used only when it resolves to the very same
 * file, so the line never names a different node than the one that mounted.
 */
export function stableNodePath(
  execPath: string = process.execPath,
  pathEnv: string | undefined = process.env.PATH
): string {
  const real = realpathOrNull(execPath);
  if (real === null || pathEnv === undefined) return execPath;
  const binary = path.basename(execPath);
  for (const dir of pathEnv.split(path.delimiter)) {
    // A RELATIVE entry — `.` and `./bin` are ordinary in a dev shell — resolves
    // against the CURRENT working directory, and the line built from it is run
    // later by rclone, a detached process with a different one. It would pass
    // `credential-process --check` here and fail an hour later at the first
    // renewal, which is the one failure this function exists to prevent.
    if (dir === "" || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, binary);
    if (candidate !== execPath && realpathOrNull(candidate) === real) return candidate;
  }
  return execPath;
}

/**
 * The AWS config file rclone's SDK reads through `AWS_CONFIG_FILE`.
 *
 * Both paths are double-quoted because the SDK runs the value through
 * `sh -c` and a home directory may contain a space. The value deliberately
 * ENDS with the unquoted `workspace credential-process <mountId>`: the ini
 * reader strips outer quotes only when the WHOLE value is one quoted token, so
 * a value that ended on a quoted path would reach the shell unquoted and break
 * on the first space.
 */
export function awsConfigFor(input: AwsConfigInput): AwsConfigResult {
  for (const field of ["execPath", "entry"] as const) {
    const because = awsConfigRefusalFor(input[field]);
    if (because !== null) return { ok: false, refusal: { field, because } };
  }
  const text =
    `[profile ${awsProfileFor(input.mountId)}]\n` +
    `credential_process = "${input.execPath}" "${input.entry}" workspace credential-process ${input.mountId}\n`;
  return { ok: true, text };
}

const AWS_CONFIG_LINE_RE =
  /^credential_process = "([^"\r\n]+)" "([^"\r\n]+)" workspace credential-process ([0-9a-f]{16})$/m;

/**
 * Read the paths back out of an `aws.config` this module wrote, so a check can
 * ask whether the node binary and the CLI entry the line names still exist.
 * Null for anything that is not exactly the line `awsConfigFor` emits.
 */
export function parseAwsConfig(text: string): AwsConfigInput | null {
  const match = AWS_CONFIG_LINE_RE.exec(text);
  if (!match) return null;
  const [, execPath, entry, mountId] = match;
  if (!text.includes(`[profile ${awsProfileFor(mountId)}]`)) return null;
  return { execPath, entry, mountId };
}

/** What a refusal to write the line says about the character it found. */
export const AWS_CONFIG_REFUSAL_TEXT = {
  "double-quote": 'a double quote (") — the ini reader would end the quoted path there',
  newline: "a line break — the ini reader would end the line there",
  "comment-start":
    "a space or tab followed by # or ; — the ini reader would read a comment from there",
  "shell-special": "a $, a backtick or a backslash — the shell would expand it inside the quotes"
} as const satisfies Record<AwsConfigRefusal["because"], string>;

export type RefreshPathProbe =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: string };

/**
 * Is the mount's refresh path usable, without minting anything? `aws.config`
 * carries the line this CLI writes for this mount, and the node binary and CLI
 * entry that line names are still where it says. `mount` runs this before
 * spawning rclone, `credential-process --check` on demand, and `status` on every
 * direct row — one probe, so the three cannot disagree about what "usable" is.
 */
export function checkRefreshPath(session: Pick<MountSession, "mountId">): RefreshPathProbe {
  const paths = sessionPathsFor(session.mountId);
  let text: string;
  try {
    text = fs.readFileSync(paths.awsConfigFile, "utf-8");
  } catch (error) {
    const state = isNoSuchFile(error) ? "missing" : "unreadable";
    return { ok: false, problem: `${paths.awsConfigFile} ${state}` };
  }
  const line = parseAwsConfig(text);
  if (line === null || line.mountId !== session.mountId) {
    return {
      ok: false,
      problem: `${paths.awsConfigFile} does not carry the credential_process line this CLI writes for mount ${session.mountId}`
    };
  }
  // node EXECUTES `execPath` and READS `entry`, so the two are checked for the
  // access each one actually needs.
  const probes = [
    { what: "node", target: line.execPath, mode: fs.constants.X_OK },
    { what: "the CLI entry", target: line.entry, mode: fs.constants.R_OK }
  ];
  for (const probe of probes) {
    try {
      fs.accessSync(probe.target, probe.mode);
    } catch {
      return {
        ok: false,
        problem: `${probe.what} at ${probe.target} missing or not usable (node or the CLI moved since the mount)`
      };
    }
  }
  return { ok: true };
}

// ── The rclone argv ───────────────────────────────────────────────────────────

/** The alias remote rclone mounts; it resolves to the bucket only inside the env. */
export const DIRECT_REMOTE = "nxws:";

export interface DirectMountArgvInput {
  readonly mountPath: string;
  readonly cacheDir: string;
  readonly slug: string;
  readonly volumeName: string;
  readonly readOnly: boolean;
}

/**
 * The `rclone mount` argv for a direct drive. Nothing here names the bucket:
 * the remote is the alias, the cache directory is keyed by the mount id, and
 * the two labels are the slug and the volume name.
 *
 * `--devname nexus-<slug>` is what `mount(8)` and `df` print — without it they
 * print rclone's device name, which defaults to the remote string and carries
 * the bucket. `--volname` reaches Finder only. Both are always set because
 * FUSE-T drops the device name and macFUSE shows the volume name. No
 * `--allow-other`: the same user's shells and Finder read the mount without
 * it, and it would need a sysctl to widen the mount to other users.
 * `--poll-interval 0` because S3 has no change notification to poll.
 */
export function directMountArgv(input: DirectMountArgvInput): string[] {
  return [
    "mount",
    DIRECT_REMOTE,
    input.mountPath,
    "--vfs-cache-mode",
    "writes",
    "--dir-cache-time",
    "5s",
    "--poll-interval",
    "0",
    "--cache-dir",
    input.cacheDir,
    "--devname",
    `nexus-${input.slug}`,
    "--volname",
    input.volumeName,
    ...(input.readOnly ? ["--read-only"] : [])
  ];
}

// ── rclone preflight: the pure half ──────────────────────────────────────────
//
// `rclone version` succeeding proves nothing about `rclone mount`: Homebrew's
// macOS build ships without the FUSE code and refuses to mount at runtime. It
// prints `go/tags: none` where the official binary prints `go/tags: cmount`,
// so the token is the capability and the preflight parses the tag list. The
// command file runs the binary and the FUSE probes; the verdicts and the texts
// live here so a test can pin them without a PATH.

export type RcloneBuildVerdict = "mount-capable" | "no-mount-support" | "no-tags-line";

export function rcloneBuildVerdict(versionOutput: string): RcloneBuildVerdict {
  const match = /^-?[ \t]*go\/tags:[ \t]*(.*)$/m.exec(versionOutput);
  if (match === null) return "no-tags-line";
  const tags = match[1].trim().split(/[\s,]+/);
  return tags.includes("cmount") ? "mount-capable" : "no-mount-support";
}

/** The macFUSE library rclone loads first, and the FUSE-T one it falls back to. */
export const MACFUSE_LIBRARY = "/usr/local/lib/libfuse.2.dylib";
export const FUSE_T_LIBRARY = "/usr/local/lib/libfuse-t.dylib";

/** Exits 0 when macFUSE's kernel extension is approved; needs no privilege. */
export const MACFUSE_LOADER = "/Library/Filesystems/macfuse.fs/Contents/Resources/load_macfuse";

export type RclonePreflightProblem =
  | { readonly kind: "rclone-missing" }
  | {
      readonly kind: "no-mount-support";
      readonly verdict: Exclude<RcloneBuildVerdict, "mount-capable">;
    }
  | { readonly kind: "no-fuse-library" }
  | { readonly kind: "macfuse-not-approved" };

/** The one sentence a preflight refusal opens with, naming the engine that ran it. */
export function preflightProblemMessage(
  problem: RclonePreflightProblem,
  engine: RcloneEngine
): string {
  const who = `--engine ${engine}`;
  switch (problem.kind) {
    case "rclone-missing":
      return `${who} needs rclone, and none was found on PATH.`;
    case "no-mount-support":
      return problem.verdict === "no-mount-support"
        ? `${who} needs an rclone built with FUSE support, and the one on PATH was built without it ` +
            "(its `rclone version` lists no `cmount` build tag — Homebrew's macOS build is the usual cause)."
        : `${who} needs an rclone built with FUSE support, and the one on PATH does not report its ` +
            "build tags (`rclone version` prints no `go/tags:` line) — it is too old, or not rclone.";
    case "no-fuse-library":
      return `${who} needs a FUSE library on macOS, and neither macFUSE nor FUSE-T is installed.`;
    case "macfuse-not-approved":
      return (
        `${who} found macFUSE, but its kernel extension is not approved yet (load_macfuse failed). ` +
        "Approve it under System Settings › Privacy & Security — on Apple Silicon that is a one-time " +
        "Recovery-mode step — then mount again."
      );
    default:
      return problem satisfies never;
  }
}

/** How to make `--engine direct` work on this platform, and the way out on the one that has one. */
export function rcloneInstallHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return [
      "Install the OFFICIAL rclone binary from https://rclone.org/downloads/ — not Homebrew's, whose build",
      "refuses `rclone mount` on macOS — and ONE FUSE library:",
      "  macFUSE  https://macfuse.github.io  (a kernel extension; Apple Silicon approves it once in Recovery mode)",
      "  FUSE-T   https://www.fuse-t.org     (no kernel extension)",
      "Or drop --engine direct: the default engine needs nothing installed."
    ].join("\n");
  }
  if (platform === "win32") {
    return "Install rclone (winget install Rclone.Rclone) and WinFsp (https://winfsp.dev), then mount again.";
  }
  return (
    "Install rclone (sudo -v ; curl https://rclone.org/install.sh | sudo bash) and FUSE " +
    "(sudo apt-get install fuse3), then mount again."
  );
}

// ── The rclone process environment ────────────────────────────────────────────

export interface RcloneEnvInput {
  readonly inherited: NodeJS.ProcessEnv;
  /** The `aws.config` this mount wrote — `sessionPathsFor(mountId).awsConfigFile`. */
  readonly awsConfigFile: string;
  readonly mountId: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
}

/** Inherited keys rclone must not see, beyond every `AWS_*` and `RCLONE_*`. */
const STRIPPED_ENV_KEYS = ["NEXUS_API_KEY", "NEXUS_PROFILE", "NEXUS_ORGANIZATION_ID"] as const;

/**
 * The process environment rclone runs under on a direct mount.
 *
 * Every inherited `AWS_*` key is dropped: a static `AWS_ACCESS_KEY_ID` in the
 * user's shell outranks `credential_process` in the SDK's chain and would sign
 * the mount with the wrong identity while looking healthy. Every inherited
 * `RCLONE_*` key is dropped for the same reason from the other side: an
 * `RCLONE_S3_ENDPOINT` left over from MinIO testing re-points the remote
 * defined below at another host, and an `RCLONE_S3_ACCESS_KEY_ID` outranks
 * `env_auth`. The three `NEXUS_*` selectors are dropped because the helper reads
 * its pins from the session file, and rclone's environment is what the helper
 * inherits.
 *
 * 🔴 STRIPPING THE ENVIRONMENT IS NOT ENOUGH, and the docblock used to claim it
 * was. rclone ALSO reads the user's own remotes from
 * `~/.config/rclone/rclone.conf` and MERGES them with these BY NAME. A user who
 * happens to have a remote called `nxs3` — the name is ours, so the collision is
 * ours — contributes their own `access_key_id`, and rclone's s3 backend honours
 * `env_auth` only while that key is BLANK. Observed against the real bucket:
 * with such a file the mount answers `InvalidAccessKeyId`; with `RCLONE_CONFIG`
 * pointed away it lists normally. So the config file is pointed at nothing, and
 * the remotes below are the only ones this process has.
 *
 * The BUCKET lives here and nowhere on a command line: the remote rclone is
 * pointed at is the alias `nxws:`, which resolves to `nxs3:<bucket>/<prefix>`
 * only inside this environment, readable by the owning user alone.
 *
 * `no_check_bucket` is load-bearing, not tuning: the session policy allows
 * ListBucket only under the mount's prefix, so the HeadBucket rclone would
 * otherwise issue at startup is denied and the mount fails before its first
 * listing.
 */
export function rcloneEnvFor(input: RcloneEnvInput): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(input.inherited)) {
    if (/^(AWS|RCLONE)_/.test(key)) continue;
    if (STRIPPED_ENV_KEYS.some((stripped) => stripped === key)) continue;
    env[key] = value;
  }
  return {
    ...env,
    AWS_CONFIG_FILE: input.awsConfigFile,
    AWS_PROFILE: awsProfileFor(input.mountId),
    AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
    AWS_EC2_METADATA_DISABLED: "true",
    // The user's own remotes merge by NAME, and `nxs3` is a name we chose.
    RCLONE_CONFIG: "/dev/null",
    RCLONE_CONFIG_NXS3_TYPE: "s3",
    RCLONE_CONFIG_NXS3_PROVIDER: "AWS",
    RCLONE_CONFIG_NXS3_ENV_AUTH: "true",
    RCLONE_CONFIG_NXS3_REGION: input.region,
    RCLONE_CONFIG_NXS3_NO_CHECK_BUCKET: "true",
    RCLONE_CONFIG_NXWS_TYPE: "alias",
    RCLONE_CONFIG_NXWS_REMOTE: `nxs3:${input.bucket}/${input.prefix}`
  };
}

// ── The process-credentials document ──────────────────────────────────────────

/** The one document `credential-process` prints: AWS's process-credentials shape. */
export interface ProcessCredentialsDocument {
  readonly Version: 1;
  readonly AccessKeyId: string;
  readonly SecretAccessKey: string;
  readonly SessionToken: string;
  /** ISO 8601 — `expiresAt` brought forward by {@link EXPIRATION_LEAD_MS}. */
  readonly Expiration: string;
}

/** The instant the helper tells the SDK the credential expires. */
export function reportedExpiration(session: Pick<MountSession, "expiresAt">): Date {
  return new Date(new Date(session.expiresAt).getTime() - EXPIRATION_LEAD_MS);
}

/** True while the session can still be served without a re-mint. */
export function isFresh(session: Pick<MountSession, "expiresAt">, now: Date): boolean {
  return reportedExpiration(session).getTime() > now.getTime();
}

/**
 * The document for a session that is still fresh, or null for one that is
 * not. Null rather than a document with a past `Expiration`: the SDK treats an
 * expired answer as already stale and reruns the helper on EVERY request, so
 * emitting one turns a Finder listing into a storm of helper processes.
 */
export function processCredentialsDocument(
  session: MountSession,
  now: Date
): ProcessCredentialsDocument | null {
  if (!isFresh(session, now)) return null;
  return {
    Version: 1,
    AccessKeyId: session.credentials.accessKeyId,
    SecretAccessKey: session.credentials.secretAccessKey,
    SessionToken: session.credentials.sessionToken,
    Expiration: reportedExpiration(session).toISOString()
  };
}

// ── Refresh decisions ─────────────────────────────────────────────────────────

/**
 * The mint body a mount and every renewal send. `workspaceId` goes only for a
 * shared mount, where the bare slug would resolve to the org-owned copy. For an
 * org-owned mount the bare slug is what lets a replaced workspace show up as a
 * DIFFERENT id, which the renewal refuses as `workspace-replaced` rather than
 * serving credentials for a stranger.
 */
export function mintBodyFor(
  workspace: { readonly shared: boolean; readonly id: string | undefined },
  access: MountAccess
): MintWorkspaceMountCredentialsBody {
  return {
    ...(workspace.shared && workspace.id !== undefined ? { workspaceId: workspace.id } : {}),
    access
  };
}

/**
 * True when a re-mint granted less than the mount was made with. Serving
 * `read` credentials under a read-write mount is the silent-loss shape:
 * rclone's write cache accepts the save and drops it at upload.
 */
export function accessIsLower(minted: MountAccess, recorded: MountAccess): boolean {
  return ACCESS_RANK[minted] < ACCESS_RANK[recorded];
}

/**
 * The failure the helper is still cooling down from, or null once it may ask
 * the backend again. Anchored on the failure's own time and never on a
 * refusal's: a refusal that re-stamped the clock would let a Finder poll extend
 * the cooldown for as long as the polling lasts. A failure stamped in the
 * FUTURE — the clock was stepped back since — does not cool down either: the
 * window would otherwise last until the clock caught up with the stamp.
 *
 * 🔴 An UNPARSEABLE stamp cools down. `isMountSession` checks `at` is a string
 * and not that it is an instant, so a damaged file yields `NaN`, and every
 * comparison against `NaN` is false — which would have returned null and opened
 * the gate this function exists to close. On a broken mount that is one mint per
 * Finder poll: a hundred-file listing becomes a hundred POSTs against a key that
 * was already refused. The unknown age is treated as "inside the window".
 */
export function refreshCooldownFailure(
  session: Pick<MountSession, "lastRefresh">,
  now: Date
): FailedRefresh | null {
  const last = session.lastRefresh;
  if (last === undefined || last.outcome !== "failed") return null;
  const stampedAt = new Date(last.at).getTime();
  if (Number.isNaN(stampedAt)) return last;
  const ageMs = now.getTime() - stampedAt;
  return ageMs >= 0 && ageMs < REFRESH_COOLDOWN_MS ? last : null;
}

/**
 * Which reason a re-mint failure is, from the error the client raised.
 *
 * 401 and 403 both land on `not-authenticated`: a revoked key, a trimmed scope
 * and a lost membership all mean "this key may no longer mint for this
 * tenant", and the fix is the same sign-in under the pinned profile name.
 */
export function refreshFailureReasonFor(error: unknown): RefreshFailureReason {
  if (error instanceof NexusTimeoutError) return "timed-out";
  if (error instanceof NexusConnectionError) return "connection-failed";
  if (error instanceof NexusAuthenticationError) return "not-authenticated";
  if (error instanceof NexusApiError) {
    if (error.status === 403) return "not-authenticated";
    if (error.status === 404) return "not-found";
    return "remote-error";
  }
  return "remote-error";
}

// ── What the user is told ─────────────────────────────────────────────────────

/** The names a message may cite. Never a bucket, a prefix or a mount id. */
export interface RefreshContext {
  readonly slug: string;
  readonly profile: string;
}

export interface RefreshFailureText {
  /** A short headline — the notification's subtitle and the status column's word. */
  readonly title: string;
  /** The notification body: what happened and what to do, for a person at a desk. */
  readonly body: (ctx: RefreshContext) => string;
  /** The `status` column's fix and the helper's stderr line, for a person at a terminal. */
  readonly statusHint: (ctx: RefreshContext) => string;
  /** True when the next click may succeed on its own, so `status` stays exit 0. */
  readonly transient: boolean;
}

/**
 * One row per reason, and ONE table: the notification, the `status` column and
 * the helper's stderr all read from here, so the three surfaces cannot tell a
 * user three different stories about one failure. `satisfies` over the closed
 * union means a reason added to the union does not compile until it has a row.
 */
/** Two reasons share the offline story; two share the gone-workspace story. Spelled once each. */
const CANT_REACH_NEXUS = {
  title: "Can't reach Nexus",
  body: () =>
    "Can't reach Nexus to renew access. Files will show errors until you're back online. " +
    "Unsaved changes upload on their own once you are."
} as const;
const WORKSPACE_GONE_BODY = ({ slug }: RefreshContext): string =>
  `This workspace was deleted or replaced. Run: nexus workspace unmount ${slug}`;

export const REFRESH_FAILURE_TABLE = {
  "not-authenticated": {
    title: "Access expired",
    body: ({ profile }) =>
      "Access expired. Files will show errors until you sign in again. In Terminal run: " +
      `nexus auth login --profile ${profile}, then open the folder again.`,
    statusHint: ({ profile, slug }) =>
      `not signed in — run: nexus auth login --profile ${profile} (keep this profile name). ` +
      "The drive itself recovers on your next click. THIS LINE DOES NOT: it is the last " +
      "renewal's own record, and only a renewal rewrites it — so `status` keeps reporting " +
      `the failure, and keeps exiting non-zero, until the drive is next used. Run: nexus workspace remount ${slug} to clear it now.`,
    transient: false
  },
  "connection-failed": {
    ...CANT_REACH_NEXUS,
    statusHint: () =>
      "cannot reach Nexus — retries on your next click. Unsent saves upload on their own once you are online.",
    transient: true
  },
  "timed-out": {
    ...CANT_REACH_NEXUS,
    statusHint: () =>
      "Nexus did not answer in time — retries on your next click. Unsent saves upload on their own once it does.",
    transient: true
  },
  "not-found": {
    title: "Workspace gone",
    body: WORKSPACE_GONE_BODY,
    statusHint: ({ slug }) =>
      `Nexus no longer serves "${slug}" to this key (deleted, or your access was narrowed) — ` +
      `run: nexus workspace unmount ${slug}`,
    transient: false
  },
  "workspace-replaced": {
    title: "Workspace replaced",
    body: WORKSPACE_GONE_BODY,
    statusHint: ({ slug }) =>
      `a different workspace now answers to "${slug}" — the drive stays on the old one. ` +
      `Run: nexus workspace unmount ${slug}, then mount it again`,
    transient: false
  },
  "access-downgraded": {
    title: "Write access removed",
    body: ({ slug }) =>
      "Your write access was removed. Changes saved from now on will NOT upload. " +
      `Run: nexus workspace remount ${slug}`,
    statusHint: ({ slug }) =>
      `your write access to "${slug}" was removed — run: nexus workspace remount ${slug} ` +
      "(it comes back read-only). Files saved since then will not upload; copy them out first.",
    transient: false
  },
  "remote-error": {
    title: "Nexus answered with an error",
    body: () =>
      "Nexus answered with an error while renewing access. Files will show errors until it " +
      "recovers; check with: nexus workspace status",
    statusHint: () =>
      "Nexus answered with an error — retry later, and check with: nexus workspace status",
    transient: false
  },
  "local-failed": {
    title: "Could not save access",
    body: () => "Nexus could not save its access file. Run: nexus workspace status",
    statusHint: ({ slug }) =>
      "the access file could not be written — check free space and ownership under " +
      `~/.nexus-mcp, then run: nexus workspace remount ${slug}`,
    transient: false
  }
} as const satisfies Record<RefreshFailureReason, RefreshFailureText>;

/**
 * The one gate from a string in a file to the closed union. Answered off the
 * table rather than a second list: `satisfies Record<RefreshFailureReason, …>`
 * on an object literal refuses a missing key AND an excess one, so the table's
 * own keys are exactly the union and nothing here can drift from it.
 */
export function isRefreshFailureReason(value: unknown): value is RefreshFailureReason {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(REFRESH_FAILURE_TABLE, value)
  );
}

/**
 * The exit category a refused refresh reports. The two helper-side refusals
 * have no {@link FailureCause} of their own: nothing about the caller's input
 * is wrong and no retry helps until the drive is mounted again, which is
 * `local-failed`'s own definition.
 */
export const REFRESH_EXIT_CAUSE = {
  "not-authenticated": "not-authenticated",
  "connection-failed": "connection-failed",
  "timed-out": "timed-out",
  "not-found": "not-found",
  "workspace-replaced": "local-failed",
  "access-downgraded": "local-failed",
  "remote-error": "remote-error",
  "local-failed": "local-failed"
} as const satisfies Record<RefreshFailureReason, FailureCause>;

/** The one notification a recovery sends. */
export const RESTORED_NOTIFICATION = {
  title: "Access restored",
  body: "Access restored. Saved changes are uploading."
} as const;

export function notificationTitle(volumeName: string): string {
  return `Nexus drive "${volumeName}"`;
}

/**
 * Should this refresh's outcome reach the desktop?
 *
 * Only a TRANSITION notifies — ok→failed and failed→ok — and never the same
 * outcome twice inside {@link NOTIFICATION_DEBOUNCE_MS}: a drive flapping
 * between the two on every click announces each state once per window. A
 * mount with no refresh yet counts as ok, so the first failure notifies and
 * the first success stays quiet. An announcement stamped in the future (the
 * clock was stepped back since) does not suppress, or the window would last
 * until the clock caught up with the stamp.
 */
export function shouldNotify(
  session: Pick<MountSession, "lastRefresh" | "lastNotified">,
  next: RefreshRecord,
  now: Date
): boolean {
  const previous = session.lastRefresh?.outcome ?? "ok";
  if (previous === next.outcome) return false;
  const announcedAt = session.lastNotified?.[next.outcome];
  if (announcedAt === undefined) return true;
  const ageMs = now.getTime() - new Date(announcedAt).getTime();
  return ageMs < 0 || ageMs >= NOTIFICATION_DEBOUNCE_MS;
}

/** The session's announcement record after `record` was announced at `record.at`. */
export function announced(
  session: Pick<MountSession, "lastNotified">,
  record: RefreshRecord
): NotifiedAt {
  return { ...session.lastNotified, [record.outcome]: record.at };
}

/** AppleScript string literal: backslash and double quote are the only escapes. */
function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The `osascript` argv for one desktop notification. Pure, so a test can read it. */
export function notificationArgv(title: string, subtitle: string, body: string): string[] {
  return [
    "-e",
    `display notification ${appleScriptString(body)} with title ${appleScriptString(title)} ` +
      `subtitle ${appleScriptString(subtitle)}`
  ];
}

// ── Names that reach the user's screen ────────────────────────────────────────

/**
 * The Finder label. rclone sanitises only its DEFAULT volname — which would be
 * the remote string, bucket included — so a name the CLI passes is stripped
 * here: `:` and `/` are path separators to macOS, runs of whitespace collapse,
 * and the length is capped. The org name is appended so two organizations
 * mounting a same-named workspace get two labels.
 *
 * The cap counts CODE POINTS, not UTF-16 units. `slice` cuts units, so a name
 * whose boundary falls inside a surrogate pair — any emoji or astral character
 * sitting on the limit — would end in half a character: invalid UTF-8 for the
 * FUSE layer, a lone `\udXXX` escape inside `session.json` that every later read
 * carries forward, and a replacement glyph in the notification title. Spreading
 * the string iterates by code point, which cannot split one.
 */
export function toVolumeName(workspaceName: string, orgName?: string): string {
  const label = orgName === undefined ? workspaceName : `${workspaceName} (${orgName})`;
  const cleaned = label
    .replace(/[:/]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const named = cleaned === "" ? "Nexus workspace" : cleaned;
  return [...named].slice(0, VOLUME_NAME_MAX_CHARS).join("").trim();
}

/**
 * Workspace bucket names as `workspace-bucket-name.ts` spells them:
 * `nxw-<env>-<12 hex>` for an organization, `nxw-<env>-shared` for the platform
 * bucket. rclone's log names the bucket in every S3 error, so a log line is
 * passed through here before it is shown to anyone.
 */
const BUCKET_NAME_RE = /\bnxw-(?:p|s|d)-(?:[0-9a-f]{12}|shared)\b/g;

export function redactBucketNames(text: string): string {
  return text.replace(BUCKET_NAME_RE, "<bucket>");
}

// ── Relative time, for the status table ──────────────────────────────────────

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "12s", "41m", "3h", "2d" — the coarsest unit that is at least one. */
function coarseDuration(ms: number): string {
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}d`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  if (ms >= MINUTE_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

/** "3m ago" — or "just now" inside the first second, and for a stamp in the future. */
export function formatAgo(at: string, now: Date): string {
  const ageMs = now.getTime() - new Date(at).getTime();
  if (ageMs < 1000) return "just now";
  return `${coarseDuration(ageMs)} ago`;
}

/** "in 41m" while the instant is ahead, "expired 3m ago" once it is behind. */
export function formatExpiry(expiresAt: string, now: Date): string {
  const leftMs = new Date(expiresAt).getTime() - now.getTime();
  if (leftMs > 0) return `in ${coarseDuration(leftMs)}`;
  return `expired ${formatAgo(expiresAt, now)}`;
}

// ── rclone's VFS cache: what a dead mount left behind ─────────────────────────
//
// rclone keeps one metadata file per cached item under `<cacheDir>/vfsMeta`,
// with `Dirty: true` on an item whose bytes are not yet uploaded, and re-uploads
// those on its next run with the same cache directory and the same remote
// definition. `umount` never waits for that write-back, so what the cache holds
// after a mount ends is the only record of saves that have not reached the
// workspace — which is why `unmount` reads it before deciding what to delete.

/**
 * Every file under `root`, with an ABSENT root answering `[]` and an unreadable
 * one THROWING.
 *
 * 🔴 The two are not the same answer, and collapsing them deletes saves. Both
 * callers below feed `unmount`, which reads "no entries" as "nothing to lose"
 * and then `rmSync(recursive, force)` the cache. A `readdirSync` can fail for
 * reasons that have nothing to do with emptiness — EACCES on an entry a `sudo`
 * run left behind, EMFILE, EIO — and each one would present a full cache as an
 * empty one. `itemIsPending` below already fails safe for exactly this reason;
 * this is the same rule one level up, at the directory read.
 */
function filesUnder(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (isNoSuchFile(error)) return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/**
 * An item whose metadata says `Dirty`, or whose metadata cannot be read at
 * all: an unreadable record is counted rather than dropped, because the cost
 * of the two mistakes is not symmetric — an over-count keeps a cache directory,
 * an under-count deletes a save.
 */
function itemIsPending(metaFile: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
  } catch {
    return true;
  }
  return isRecord(parsed) && parsed.Dirty === true;
}

/**
 * A cache that is present and cannot be read.
 *
 * 🔴 INFINITE ON PURPOSE, and the reason is that the two decision sites compare
 * in OPPOSITE directions: one refuses unless the count `=== 0`, the other
 * refuses when it is `> 0`. A finite sentinel is safe at one and wrong at the
 * other — `-1` passes the `> 0` gate and deletes the cache. Only a value that is
 * both non-zero and greater than zero fails safe at both, so an unreadable cache
 * is "more saves than you can lose" rather than a number.
 *
 * {@link describePendingUploads} is how it reaches a human; `JSON.stringify`
 * renders it `null`, which is the right answer for a count nobody knows.
 */
export const PENDING_UPLOADS_UNKNOWN = Number.POSITIVE_INFINITY;

/** How a pending-upload count is spoken: a number, or the honest non-answer. */
export function describePendingUploads(count: number): string {
  return count === PENDING_UPLOADS_UNKNOWN ? "An unknown number of" : String(count);
}

/**
 * How many cached items are still waiting to upload. Zero when the cache is
 * ABSENT; {@link PENDING_UPLOADS_UNKNOWN} when it is there and cannot be read.
 *
 * The unknown answer exists so a caller cannot mistake "I could not look" for
 * "there is nothing there" — the mistake that ends in a deleted save.
 */
export function countPendingUploads(cacheDir: string): number {
  try {
    return filesUnder(path.join(cacheDir, "vfsMeta")).filter(itemIsPending).length;
  } catch {
    return PENDING_UPLOADS_UNKNOWN;
  }
}

/** True while the cache holds any item at all — the state `unmount` never deletes. */
export function cacheHoldsEntries(cacheDir: string): boolean {
  return ["vfs", "vfsMeta"].some((tree) => {
    try {
      return filesUnder(path.join(cacheDir, tree)).length > 0;
    } catch {
      // Present and unreadable: the cache is not known to be empty, so it stays.
      return true;
    }
  });
}

/** The remedy every dirty-cache refusal ends with: where the unsent bytes sit, and what deleting them means. */
export function discardPendingSavesHint(cacheDir: string): string {
  return `copy them out of ${cacheDir}/vfs and delete ${cacheDir} to discard them`;
}

// ── The status verdict: three local reads, one word ───────────────────────────

export type RefreshVerdict =
  /** The last renewal succeeded (or none was needed yet) and the access is still valid. */
  | { readonly kind: "ok"; readonly at: string }
  /** The access has expired and nothing has asked for a renewal since; the next click will. */
  | { readonly kind: "stale"; readonly expiredAt: string }
  /** The last renewal failed; `transient` says whether the next click may succeed on its own. */
  | {
      readonly kind: "failed";
      readonly at: string;
      readonly reason: RefreshFailureReason;
      readonly transient: boolean;
      readonly fix: string;
    }
  /** No renewal can run: a file, a path or the profile the helper needs is gone. */
  | { readonly kind: "broken"; readonly what: string; readonly fix: string };

export interface DirectMountHealth {
  readonly verdict: RefreshVerdict;
  /** Null when the session file cannot be read. */
  readonly expiresAt: string | null;
  readonly pendingUploads: number;
}

export interface DirectMountHealthInput {
  readonly mountId: string;
  readonly slug: string;
  /** Whether `config.json` still holds the named profile — the helper's key source. */
  readonly profileExists: (name: string) => boolean;
  readonly now: Date;
}

/** The fix every broken-renewal verdict names. */
export function remountFix(slug: string): string {
  return `nexus workspace remount ${slug}`;
}

/** The mount that reaches ONE copy of a slug — `--shared` is what picks the other. */
export function mountFix(slug: string, shared: boolean): string {
  return `nexus workspace mount ${slug}${shared ? " --shared" : ""} --engine direct`;
}

/**
 * What `status` says about a direct mount's renewal, from LOCAL reads only:
 * the session file's `expiresAt` and `lastRefresh`, the two paths the
 * `aws.config` line names, and the profile's presence in `config.json`. Never
 * a network call — the server is not consulted, and the column says what THIS
 * machine can prove.
 *
 * The ladder: a broken refresh path outranks everything (no renewal can run at
 * all), a recorded failure outranks staleness (it says WHY the next click will
 * fail), and an expired session with no failure recorded is merely stale — the
 * next click renews it.
 */
export function directMountHealth(input: DirectMountHealthInput): DirectMountHealth {
  const paths = sessionPathsFor(input.mountId);
  const pendingUploads = countPendingUploads(paths.cacheDir);
  const read = readSession(input.mountId);
  if (!read.ok) {
    const state = read.why === "missing" ? "missing" : "unreadable";
    return {
      verdict: {
        kind: "broken",
        what: `${paths.sessionFile} ${state}`,
        fix: remountFix(input.slug)
      },
      expiresAt: null,
      pendingUploads
    };
  }
  const { session } = read;
  const health = (verdict: RefreshVerdict): DirectMountHealth => ({
    verdict,
    expiresAt: session.expiresAt,
    pendingUploads
  });
  if (!input.profileExists(session.profile)) {
    return health({
      kind: "broken",
      what: `profile "${session.profile}" missing from config.json`,
      fix: `nexus auth login --profile ${session.profile}`
    });
  }
  const probe = checkRefreshPath(session);
  if (!probe.ok)
    return health({ kind: "broken", what: probe.problem, fix: remountFix(input.slug) });
  const last = session.lastRefresh;
  if (last !== undefined && last.outcome === "failed") {
    const row = REFRESH_FAILURE_TABLE[last.reason];
    return health({
      kind: "failed",
      at: last.at,
      reason: last.reason,
      transient: row.transient,
      fix: row.statusHint({ slug: input.slug, profile: session.profile })
    });
  }
  // 🔴 UNREADABLE IS NOT VALID. `isMountSession` checks `expiresAt` is a string
  // and not that it is an instant, so `""` or a truncated ISO stamp yields NaN —
  // and `NaN <= now` is FALSE, which fell through to `ok` and exited 0 for a
  // drive whose expiry nobody can read. `isFresh` already fails safe on the same
  // field, so the two readers of one value disagreed about which way to fail.
  // A `broken` verdict, not `stale`: staleness heals on the next click, and this
  // does not — the file has to be rewritten.
  const expiresAt = new Date(session.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return health({
      kind: "broken",
      what: `${sessionPathsFor(input.mountId).sessionFile} records an unreadable expiry`,
      fix: remountFix(input.slug)
    });
  }
  if (expiresAt <= input.now.getTime()) {
    return health({ kind: "stale", expiredAt: session.expiresAt });
  }
  return health({ kind: "ok", at: last?.at ?? session.mintedAt });
}

/**
 * True when `status` must exit non-zero over this row: the next click cannot
 * heal it. A transient failure (offline, a slow backend) is printed and left
 * at exit 0, because the next click may well succeed.
 */
export function refreshVerdictIsUnhealthy(verdict: RefreshVerdict): boolean {
  switch (verdict.kind) {
    case "broken":
      return true;
    case "failed":
      return !verdict.transient;
    case "ok":
    case "stale":
      return false;
    default:
      return verdict satisfies never;
  }
}

/**
 * The Refresh column: exactly one of four shapes. `live` is the row's own
 * liveness — a stale session refreshes on the next access only while there is
 * a process to access it through.
 */
export function describeRefresh(verdict: RefreshVerdict, now: Date, live: boolean): string {
  switch (verdict.kind) {
    case "ok":
      return `ok ${formatAgo(verdict.at, now)}`;
    case "stale": {
      const then = live ? "refreshes on next access" : "mount is not live — remount";
      return `stale: expired ${formatAgo(verdict.expiredAt, now)}, ${then}`;
    }
    case "failed":
      return `failed ${formatAgo(verdict.at, now)}: ${REFRESH_FAILURE_TABLE[verdict.reason].title} — ${verdict.fix}`;
    case "broken":
      return `broken: ${verdict.what} — run: ${verdict.fix}`;
    default:
      return verdict satisfies never;
  }
}

/** The `refresh` object `status --json` prints for a direct row. */
export interface RefreshJson {
  readonly outcome: RefreshVerdict["kind"];
  readonly at: string | null;
  readonly reason: RefreshFailureReason | null;
  readonly transient: boolean;
  readonly fix: string | null;
}

export function refreshJson(verdict: RefreshVerdict): RefreshJson {
  switch (verdict.kind) {
    case "ok":
      return { outcome: "ok", at: verdict.at, reason: null, transient: false, fix: null };
    case "stale":
      return { outcome: "stale", at: verdict.expiredAt, reason: null, transient: false, fix: null };
    case "failed":
      return {
        outcome: "failed",
        at: verdict.at,
        reason: verdict.reason,
        transient: verdict.transient,
        fix: verdict.fix
      };
    case "broken":
      return { outcome: "broken", at: null, reason: null, transient: false, fix: verdict.fix };
    default:
      return verdict satisfies never;
  }
}
