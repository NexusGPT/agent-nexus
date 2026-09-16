import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { WorkspaceMountAccess } from "@agent-nexus/sdk";

import { ensureSecretDir, writeSecretFile } from "./util/secret-file";

// ── Workspace mount registry ─────────────────────────────────────────────────
//
// On-disk record of which workspaces are mounted, so `unmount`/`status` can find
// a mount again. The registry lives at `~/.nexus-mcp/workspace-mounts.json`.
//
// Historically it was a `Record<slug, MountRecord>` — keyed by bare workspace
// slug, machine-wide, org-blind. That allowed only ONE mount per slug across ALL
// orgs (NEX-2360): a user in two orgs could not mount each org's `general-context`
// at distinct paths simultaneously. The registry is now keyed by
// `<kind>:<id>|<slug>` where `<kind>:<id>` identifies the ACTING ORG pinned at
// mount time (`org:<orgId>`, else `profile:<name>`, else `url:<baseUrl>`), and
// each record carries the org/profile that owns it (NEX-2372: `status` reads
// these back, together with the ro/rw mode).
//
// The `<kind>:` tag is load-bearing, not decoration. Profile names are
// `^[a-z0-9][a-z0-9_-]{0,31}$` (config.ts), which an org id like `org_a1b2c3`
// satisfies — so an UNTAGGED `<id>|<slug>` key space lets a profile named after
// an org id generate that org's exact registry key. `findMount` would then hand
// another org's live row to `unmount` (detaching its drive and deleting its row),
// the mount guard would refuse on its behalf, and a fresh mount would overwrite
// it. Tagging by kind makes the two spaces disjoint at the string level: an
// `org:` key can never equal a `profile:` or `url:` key.
//
// That disjointness is BETWEEN tags, and only between tags. WITHIN the `url:`
// tag there is exactly one bucket per (base URL, slug) — every org that mounts
// anonymously (raw `--api-key`/`NEXUS_API_KEY` with no `NEXUS_ORGANIZATION_ID`)
// on a given host shares it, because nothing client-side can tell those callers
// apart. Two orgs mounting the same slug that way collide: the second is refused
// by the live-mount guard rather than silently overwriting the first, and the
// refusal says so. It is a block, not data loss — but it is a real cross-org
// interaction, so do not read the tag argument as covering it.
//
// The bucket is confined to the callers that can produce one. `mountScopeId`
// reaches `url:` only when there is no orgId and no profile, so an IDENTIFIED
// caller never writes such a row — and `scopeCandidateKeys` therefore never
// offers one back to it. Doing so was a cross-org hole in both directions: it
// refused an identified org a mount of its own slug, and it let
// `unmount <slug>` detach an anonymous caller's live drive and delete its row.
//
// `|` separates the scope id from the slug, so an id may never contain one. Org
// ids and profile names cannot (both are alphanumeric plus `-`/`_`), but the
// `url:` id is `--base-url`/`NEXUS_BASE_URL`/profile config with only a trailing
// slash stripped — user input, not a validated shape. `scopeIdOfKind` therefore
// ENFORCES the invariant by percent-encoding `|` rather than asserting it holds.
//
// The acting org is resolved exactly the way `createClient` resolves it for API
// calls — `NEXUS_ORGANIZATION_ID` override first, then the profile's selected
// org (NEX-2474) — so what the registry records is what the server will serve:
// post NEX-3175 a mismatched organization-id header 403s instead of silently
// answering from another org, making the resolution deterministic at mount time.
// Switching orgs later (`nexus auth use-org`) does NOT retarget existing mounts;
// they stay pinned to the org recorded when they were created.
//
// Scoping the KEY does not scope the mount POINT. The default mount point is
// `~/nexus/<org>/<slug>` (`defaultMountPath`), so two orgs mounting one slug
// land in two directories by default — but `--at` names any path, rows written
// before the org segment existed sit at `~/nexus/<slug>`, and two orgs whose
// names slugify alike share a segment. `claimMountPoint` holds the invariant the
// key alone cannot — one registry row per mount point, across every scope — so a
// clash is refused with `--at <path>` named instead of silently stacking a mount,
// and unmounting one org's row can never detach another org's live drive.
//
// Migration: legacy bare-slug entries (pre-NEX-2360) remain readable and are
// matched as a fallback (see `findMount`). They migrate on first touch — a new
// mount of the slug replaces the stale legacy row with a scoped one, and an
// unmount removes it. No proactive rewrite of the registry file is performed.

/**
 * How a recorded mount is served. `webdav` and `rclone` both speak WebDAV to
 * the gateway — the native macOS client and rclone over FUSE, the latter the
 * Linux and Windows default; `direct` is rclone signing S3 requests itself with
 * a one-hour credential the CLI refreshes through `workspace credential-process`.
 * The one list every engine gate and table derives from.
 */
export const ENGINES = ["webdav", "rclone", "direct"] as const;
export type Engine = (typeof ENGINES)[number];

/**
 * How a recorded mount's liveness is probed: by signalling the detached
 * process it recorded, or by reading the OS mount table. Keyed exhaustively
 * on `Engine` so a new engine cannot default to the wrong probe.
 */
export const ENGINE_LIVENESS = {
  webdav: "mount-table",
  rclone: "pid",
  direct: "pid"
} as const satisfies Record<Engine, "pid" | "mount-table">;

/**
 * The engines that spawn rclone, so the preflight and its message speak of the
 * one the caller actually asked for. Derived, so a fourth engine cannot join
 * the pair by being spelled into a second list.
 */
export type RcloneEngine = Extract<Engine, "rclone" | "direct">;

/** The access a direct-engine mount was granted, as the server graded it — the SDK's own grade type. */
export type MountAccess = WorkspaceMountAccess;

/**
 * One recorded mount.
 *
 * 🚨 NO BUCKET, PREFIX, REGION OR CREDENTIAL FIELD. `workspace status --json`
 * projects a fixed field set from these records, so what reaches a script's
 * stdout is decided at that projection — and a projection can only print what
 * the row holds. Keeping storage names out of the row means no field added to
 * the projection can leak one. The direct engine keeps what rclone needs in
 * the mount's own owner-only session file and in the rclone process env; the
 * registry row carries only what `status`, `unmount` and a later mount of the
 * same workspace need to find them again.
 */
export interface MountRecord {
  slug: string;
  engine: Engine;
  mountPath: string;
  baseUrl: string;
  /**
   * The direct engine's per-mount id: the first 16 hex digits of the sha256 of
   * the registry key, so one org + slug always maps to one session directory
   * and one rclone cache directory across remounts. Absent on other engines.
   */
  mountId?: string;
  /** The access the server GRANTED at mint time. Direct engine only. */
  access?: MountAccess;
  /** True when the admin-shared workspace was mounted (via `--shared`), not the
   *  same-slug org-owned one. Absent on records written before NEX-2362. */
  shared?: boolean;
  /** Immutable id of the mounted workspace, when resolved from the list. */
  workspaceId?: string;
  /** True when read-only was ASKED FOR (`--read-only`, or a CODE kind). Absent on
   *  records written before NEX-2372 — mode was unobservable until a write
   *  failed. The effective mode of a direct row also reads `access`: a `read`
   *  grant makes the drive read-only whatever was asked, and `remount` asks for
   *  this flag again rather than replaying the grant. */
  readOnly?: boolean;
  /** Present only for the engines that spawn rclone; native WebDAV has no tracked process. */
  pid?: number;
  mountedAt: string;
  /** Acting org pinned at mount time (absent on legacy pre-NEX-2360 entries,
   *  and on mounts made with a raw --api-key that resolved no org). */
  orgId?: string;
  orgName?: string;
  /** Name of the profile that mounted this; absent for --api-key overrides. */
  profile?: string;
}

/** The org/profile a mount belongs to, used to namespace the registry key. */
export interface MountScope {
  profile?: string;
  orgId?: string;
  orgName?: string;
  baseUrl: string;
}

export const STATE_DIR = path.join(os.homedir(), ".nexus-mcp");
export const STATE_FILE = path.join(STATE_DIR, "workspace-mounts.json");
export const LOG_DIR = path.join(STATE_DIR, "logs");

/**
 * An id may be used as a directory name VERBATIM or not at all.
 *
 * Verbatim because it is an identity, not a label: `org_39FoxcMixrC5rGX65cZ…`
 * is what the folder is called today, and rewriting it — lowercasing, turning
 * `_` into `-` — would rename every existing default mount point. Refused
 * outright when it does not match, because there is no honest way to "clean" an
 * identity: the result would name an organization that does not exist.
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The `<org>` segment of a default mount point: the organization's NAME
 * slugified (lowercase, `[a-z0-9-]`) when it is known, its id when only that is,
 * and nothing when the scope names no organization at all (a raw --api-key with
 * no NEXUS_ORGANIZATION_ID) — then the path is the org-less `~/nexus/<slug>`.
 *
 * 🔴 BOTH HALVES ARE SANITISED, and the id half is the one that was not. The
 * name is slugified because it is a display string; the id looked safe because
 * it looks like `org_2rES0…`. It is not checked anywhere on the way here —
 * `resolveOrganization` returns `NEXUS_ORGANIZATION_ID` verbatim — so it is
 * caller input reaching `path.join`, and `../../tmp/x` there resolves the
 * default mount point OUTSIDE `~/nexus`, which `createMountDir` then creates.
 * `assertMountableSlug` refuses exactly this on the other half of the same path,
 * for exactly this reason; this is that guard, applied to the segment the
 * `~/nexus/<org>/<slug>` default added.
 *
 * An id that survives no character is dropped rather than replaced: an empty
 * segment falls back to the org-less path, which is a real layout, where a
 * placeholder would invent a directory name no organization owns.
 */
export function mountPathOrgSegment(
  scope: Pick<MountScope, "orgId" | "orgName">
): string | undefined {
  const fromName =
    scope.orgName === undefined
      ? ""
      : scope.orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
  if (fromName !== "") return fromName;
  return scope.orgId !== undefined && SAFE_PATH_SEGMENT.test(scope.orgId) ? scope.orgId : undefined;
}

/** `~/nexus/<org>/<slug>` — see {@link mountPathOrgSegment} for the `<org>` half. */
export function defaultMountPath(
  slug: string,
  scope: Pick<MountScope, "orgId" | "orgName">
): string {
  const org = mountPathOrgSegment(scope);
  const segments = org === undefined ? [slug] : [org, slug];
  return path.join(os.homedir(), "nexus", ...segments);
}

/** Separator between the scope id and the slug in a registry key. */
const KEY_SEP = "|";

/** Separator between the scope KIND tag and the scope id. */
const KIND_SEP = ":";

/**
 * Which namespace a scope id lives in. Without this tag the id spaces overlap —
 * a profile may legally be named `org_a1b2c3`, i.e. exactly an org id — and one
 * org's registry row becomes reachable from another identity.
 */
export type MountScopeKind = "org" | "profile" | "url";

/** The tagged identity a mount is namespaced by. */
export interface MountScopeIdentity {
  kind: MountScopeKind;
  id: string;
}

/**
 * The identity that namespaces a mount. Prefer the acting orgId (pinned at
 * mount time); fall back to the profile name, then the base URL, so a mount is
 * still scoped even when `--api-key`/`NEXUS_API_KEY` bypassed profiles and no
 * org could be resolved (the "unknown org" fallback bucket).
 */
export function mountScopeIdentity(scope: MountScope): MountScopeIdentity {
  if (scope.orgId) return { kind: "org", id: scope.orgId };
  if (scope.profile) return { kind: "profile", id: scope.profile };
  return { kind: "url", id: scope.baseUrl };
}

/**
 * Keep `KEY_SEP` out of a scope id, so `<kind>:<id>|<slug>` always splits at the
 * separator this module put there.
 *
 * Org ids and profile names cannot contain `|` — both are alphanumeric plus
 * `-`/`_`. The `url:` id can: `scope.baseUrl` is `--base-url` /`NEXUS_BASE_URL`/
 * profile config with only a trailing slash stripped, and "`|` is not legal in a
 * URL per RFC 3986" is a statement about well-formed URLs, not a guarantee about
 * a string a user typed. Percent-encoding it makes the key-space invariant
 * something this module enforces instead of something a comment claims.
 *
 * `%7C` is chosen over dropping or rejecting the character so the mapping stays
 * total and reversible-looking: a hand-inspected registry still shows which host
 * the row belongs to.
 */
function encodeScopeId(id: string): string {
  return id.includes(KEY_SEP) ? id.split(KEY_SEP).join("%7C") : id;
}

/** `<kind>:<id>` — the scope half of a registry key. */
export function scopeIdOfKind(kind: MountScopeKind, id: string): string {
  return `${kind}${KIND_SEP}${encodeScopeId(id)}`;
}

/**
 * Stable per-org identifier used to namespace a mount, TAGGED by kind
 * (`org:`/`profile:`/`url:`). The tag is what keeps a profile named after an
 * org id from addressing that org's mounts: the three tags differ in their
 * first character, so ids from DIFFERENT namespaces can never produce the same
 * string however they collide.
 *
 * Within a namespace they still can, and one namespace is deliberately coarse:
 * `url:` buckets every anonymous caller on a host together (see the module
 * header). The tag argument is about cross-namespace collisions only.
 */
export function mountScopeId(scope: MountScope): string {
  const { kind, id } = mountScopeIdentity(scope);
  return scopeIdOfKind(kind, id);
}

/** Composite registry key: `<kind>:<id>|<slug>`. Slugs never contain `|`. */
export function mountKey(scope: MountScope, slug: string): string {
  return `${mountScopeId(scope)}${KEY_SEP}${slug}`;
}

/**
 * Every registry key the active scope could have produced for `slug`, in
 * priority order. `mountScopeId` prefers orgId but falls back to profile (or
 * base URL) — so a mount written before login filled in orgId is keyed by the
 * profile name, and the canonical orgId-based key would miss it. Matching all
 * of a scope's identifiers absorbs that drift. Each candidate is tagged with
 * its own kind, so the profile candidate can only ever hit rows this profile
 * wrote and the org candidate only rows that org wrote — a profile named like
 * an org id addresses `profile:<name>|<slug>`, never `org:<name>|<slug>`.
 */
export function scopeCandidateKeys(scope: MountScope, slug: string): string[] {
  const keys: string[] = [];
  if (scope.orgId) keys.push(`${scopeIdOfKind("org", scope.orgId)}${KEY_SEP}${slug}`);
  if (scope.profile) keys.push(`${scopeIdOfKind("profile", scope.profile)}${KEY_SEP}${slug}`);
  // The base-URL key belongs to ANONYMOUS callers only, so only an anonymous
  // scope may claim it.
  //
  // `mountScopeId` prefers orgId, then profile, and reaches `url:<baseUrl>` only
  // when neither exists — so an identified caller can never have WRITTEN a
  // `url:` row. Offering it to one anyway is a cross-org hole, not a fallback:
  // that key is a single bucket per (base URL, slug) shared by every anonymous
  // caller on the host, and an anonymous record names no owner for
  // `ownerConflictsWithScope` to reject. An identified org therefore matched a
  // row it cannot own — which blocked its own `mount` of the slug at a
  // different path (the very independence NEX-2360 exists to give it) and, far
  // worse, let `unmount <slug>` OS-detach a DIFFERENT org's live drive and
  // delete the row, silently.
  //
  // The cost of the narrowing is bounded and visible: a caller who mounted
  // anonymously and has since logged in no longer reaches that row by slug.
  // `unmount` answers with the candidate list from `findMountsBySlug` — "it is
  // mounted for: …" — instead of guessing, and the row stays reachable from the
  // anonymous scope that created it. Failing to find your own mount is
  // recoverable; detaching someone else's is not.
  if (!scope.orgId && !scope.profile) {
    keys.push(`${scopeIdOfKind("url", scope.baseUrl)}${KEY_SEP}${slug}`);
  }
  return keys;
}

/** A bare-slug key written before org-scoping existed (NEX-2360). */
export function isLegacyKey(key: string): boolean {
  return !key.includes(KEY_SEP);
}

/**
 * True when a record's recorded owner identifies a *different* org/profile than
 * the active scope, i.e. the row is not ours to read, replace, or unmount.
 *
 * `findMount` runs this on EVERY candidate it matches, not just the base-URL
 * one: a key alone proves only that some scope with that (kind, id) wrote the
 * row, while the record itself carries the identity that was pinned at mount
 * time. Checking both means a drifted or hand-edited registry can't route one
 * org's action onto another org's row even if the key lines up.
 *
 * The ladder, in order:
 *   - A record naming NO owner at all is the anonymous base-URL-bucket mount
 *     (raw `--api-key`, no resolvable org). It never conflicts — finding it is
 *     exactly what the base-URL candidate exists for.
 *   - When both sides name an org, the ORG decides and the profiles are
 *     irrelevant: the registry is org-scoped, so a second profile on the same
 *     org must resolve that org's mount.
 *   - Otherwise only profile identity is comparable; same profile, same owner.
 *   - Anything left names an org/profile the other side cannot see. That is
 *     unverifiable, so treat it as a conflict rather than guess.
 */
export function ownerConflictsWithScope(record: MountRecord, scope: MountScope): boolean {
  if (!record.orgId && !record.profile) return false;
  if (record.orgId && scope.orgId) return record.orgId !== scope.orgId;
  if (record.profile && scope.profile) return record.profile !== scope.profile;
  return true;
}

export function readMounts(): Record<string, MountRecord> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Record<string, MountRecord>;
  } catch {
    return {};
  }
}

export function writeMounts(mounts: Record<string, MountRecord>): void {
  writeSecretFile(STATE_FILE, JSON.stringify(mounts, null, 2) + "\n");
}

/**
 * Create `dir` under `STATE_DIR`, with BOTH at 0700 whether they existed or not.
 *
 * `STATE_DIR` is `~/.nexus-mcp` — the directory that also holds `config.json`,
 * the plaintext API key. So every route that can bring that directory into
 * existence decides the mode the credential file will sit behind, including the
 * ones that write nothing secret themselves. A bare
 * `mkdirSync(LOG_DIR, { recursive: true })` created it at the caller's umask,
 * and a create-time mode argument would not have helped on a directory that is
 * already there.
 */
export function ensureStateSubdir(dir: string): void {
  ensureSecretDir(STATE_DIR);
  if (dir !== STATE_DIR) ensureSecretDir(dir);
}

/**
 * Locate a recorded mount for `slug`, scoped to `scope` when known.
 *
 * Resolution order:
 *   1. Any of the active scope's candidate keys (orgId and profile; the base-URL
 *      key only for a scope that has neither — see `scopeCandidateKeys`), so a
 *      mount survives orgId-vs-profile key drift across logins.
 *   2. Legacy bare-slug key — a pre-NEX-2360 entry with no org recorded.
 *   3. A unique record whose `slug` matches AND names no owner — ONLY when the
 *      scope is unknown (e.g. `unmount` run without resolvable auth). Skipped
 *      when ambiguous so we never guess between two orgs' mounts of the same
 *      slug, and skipped when the one match names an org/profile, because an
 *      unknown scope cannot show that row is its own. Either way the caller
 *      should list the candidates (`findMountsBySlug`) instead.
 *
 * EVERY match — scoped or legacy — is then checked against the record's own
 * recorded owner (`ownerConflictsWithScope`). The key proves which scope wrote
 * the row; the record proves which org it was pinned to. Both must agree before
 * we hand a caller a row it may unmount, replace, or delete.
 *
 * When the scope IS known, resolution stops after the scoped + legacy keys: a
 * cross-scope slug match is never used, so `unmount` on org A can never detach
 * org B's mount of the same slug — the very org-blindness NEX-2360 fixes.
 *
 * Used by the mount guard too: it must see the same scoped + legacy entries so a
 * still-live pre-upgrade (or pre-drift) mount of the slug blocks a duplicate.
 */
export function findMount(
  mounts: Record<string, MountRecord>,
  slug: string,
  scope?: MountScope
): { key: string; record: MountRecord } | undefined {
  if (scope) {
    for (const key of scopeCandidateKeys(scope, slug)) {
      const record = mounts[key];
      if (!record) continue;
      // The key is tagged by kind, so it can only have been written by a scope
      // with this same (kind, id) — but a record still carries the org that was
      // pinned at mount time, which a re-login or a hand-edited registry can put
      // at odds with the key. Verify the recorded owner on every candidate: the
      // key answers who WROTE the row, the record who it was pinned to, and a
      // registry that has drifted between the two must route nobody's action
      // onto anybody else's row.
      if (ownerConflictsWithScope(record, scope)) continue;
      return { key, record };
    }
  }
  if (mounts[slug] && isLegacyKey(slug)) {
    // Legacy rows predate org recording, so they normally name no owner and
    // never conflict. One that DOES name another org (upgraded then hand-edited)
    // is not ours to touch.
    const record = mounts[slug];
    if (!scope || !ownerConflictsWithScope(record, scope)) return { key: slug, record };
  }

  // Slug-only match is a last resort for an unknown scope. With a known scope we
  // have already checked its candidate keys, so falling through here could
  // detach a different org's mount of the same slug.
  if (scope) return undefined;
  const matches = Object.entries(mounts).filter(([, r]) => r.slug === slug);
  if (matches.length !== 1) return undefined;
  const [key, record] = matches[0];
  // Uniqueness is not ownership. `unmount` OS-detaches and deletes whatever this
  // returns, and an unknown scope is reached by ordinary accidents — a typo'd
  // `--profile` (resolveProfile throws, the caller swallows it), a raw
  // `--api-key`/`NEXUS_API_KEY` with no `NEXUS_ORGANIZATION_ID`, a machine with
  // no profile configured. Handing back a row that NAMES an org/profile in that
  // state is the same cross-org destructive action the scoped path exists to
  // prevent, just reached from the other side: the caller cannot show the row is
  // theirs, and the row says whose it is. Refuse, and let the caller list the
  // candidates so the user names an org instead of the CLI guessing one.
  //
  // A record naming NO owner is still returned: that is the anonymous
  // base-URL-bucket mount (or a legacy pre-NEX-2360 row), where there is no
  // identity to contradict and refusing would strand a live mount with no way to
  // detach it.
  if (record.orgId || record.profile) return undefined;
  return { key, record };
}

/**
 * Every recorded mount whose mount POINT is `mountPath`, excluding `exceptKey`
 * (the caller's own row, which it handles itself).
 *
 * Registry keys are org-scoped (NEX-2360); mount points are not. `--at` names
 * any directory, rows written before the default carried an org segment sit at
 * `~/nexus/<slug>`, and a scope-filtered `findMount` never sees another org's
 * row on the same path. Two rows naming one mount point
 * corrupt each other: every OS-level action keys off `mountPath`, so unmounting
 * one row detaches whatever is mounted there — including another org's live
 * drive — and a webdav row reads "live" merely because the OTHER org's mount
 * owns its path. Callers use this to hold the invariant: one row per mount
 * point, whatever the scope.
 *
 * Paths are compared after `path.resolve`, so a trailing slash or a relative
 * `--at` still recognises the same directory. Rows with no usable `mountPath`
 * (hand-edited registry) are skipped rather than crashing the compare.
 */
export function findMountsByPath(
  mounts: Record<string, MountRecord>,
  mountPath: string,
  exceptKey?: string
): { key: string; record: MountRecord }[] {
  const target = path.resolve(mountPath);
  return Object.entries(mounts)
    .filter(
      ([key, r]) =>
        key !== exceptKey &&
        typeof r?.mountPath === "string" &&
        r.mountPath.length > 0 &&
        path.resolve(r.mountPath) === target
    )
    .map(([key, record]) => ({ key, record }));
}

/** Verdict on whether a mount point can be claimed for a new mount. */
export interface MountPointClaim {
  /** A LIVE mount recorded by another row already owns the path — refuse. */
  blockedBy?: { key: string; record: MountRecord };
  /** Dead rows naming the path; drop them as the new mount takes it over. */
  stale: { key: string; record: MountRecord }[];
}

/**
 * Decide whether `mountPath` can be used for a new mount, given every row in
 * the registry (not just the acting org's — mount points are machine-global).
 *
 * - A live row on the path blocks the mount: mounting on top of it would stack
 *   two drives on one directory and leave two registry rows pointing at it, so
 *   unmounting either would detach the other's live mount.
 * - A dead row on the path is reported as `stale`. It describes nothing real
 *   any more, and left in place it would come to describe the NEW mount — a
 *   later `unmount` of that row would detach a drive it never mounted.
 *
 * `isLive` is injected so this stays pure and testable; the CLI passes its
 * engine-aware liveness probe.
 */
export function claimMountPoint(
  mounts: Record<string, MountRecord>,
  mountPath: string,
  opts: { exceptKey?: string; isLive: (record: MountRecord) => boolean }
): MountPointClaim {
  const stale: { key: string; record: MountRecord }[] = [];
  for (const hit of findMountsByPath(mounts, mountPath, opts.exceptKey)) {
    // A live claimant is fatal, so don't offer stale rows for deletion too —
    // the caller mutates nothing on the blocked path.
    if (opts.isLive(hit.record)) return { blockedBy: hit, stale: [] };
    stale.push(hit);
  }
  return { stale };
}

/**
 * All recorded mounts of `slug`, across every org/scope. Used to disambiguate:
 * when a scoped (or unscoped) lookup finds nothing, the caller lists these so
 * the error names the orgs that DO have the slug mounted instead of a bare
 * "No mount recorded" (NEX-2360).
 */
export function findMountsBySlug(
  mounts: Record<string, MountRecord>,
  slug: string
): { key: string; record: MountRecord }[] {
  return Object.entries(mounts)
    .filter(([, r]) => r.slug === slug)
    .map(([key, record]) => ({ key, record }));
}

/** Human-readable description of which org/profile owns a mount. */
export function describeOwner(record: MountRecord): string {
  if (record.orgName && record.profile) {
    return `org "${record.orgName}" (profile "${record.profile}")`;
  }
  if (record.orgName) return `org "${record.orgName}"`;
  if (record.orgId && record.profile) {
    return `org ${record.orgId} (profile "${record.profile}")`;
  }
  if (record.orgId) return `org ${record.orgId}`;
  if (record.profile) return `profile "${record.profile}"`;
  return `base URL ${record.baseUrl}`;
}

/** Human-readable description of the active scope, for error messages. */
export function describeScope(scope: MountScope): string {
  if (scope.orgName) return `org "${scope.orgName}"`;
  if (scope.orgId) return `org ${scope.orgId}`;
  if (scope.profile) return `profile "${scope.profile}"`;
  return `base URL ${scope.baseUrl}`;
}

/**
 * What `unmount <slug>` says when the slug IS mounted but not for this scope.
 *
 * A pure function on purpose: this text is the entire remedy the user gets, it
 * has been wrong twice, and inside a commander action nothing can assert it.
 * The three branches are three different situations, and advice that fits one
 * of them is actively misleading in the others.
 *
 * The middle branch is the one that keeps getting missed. Every candidate can
 * be UNOWNED — the anonymous base-URL bucket, which an identified scope
 * deliberately no longer resolves — and then "switch to the owning profile/org"
 * names a profile and an org that do not exist. That is the exact state of a
 * caller who mounted with a raw `--api-key` and has since logged in, and the
 * advice would leave them circling a live mount forever.
 */
/** One line per candidate row: who owns it, and where it sits. */
function candidateList(candidates: readonly { readonly record: MountRecord }[]): string {
  return candidates
    .map((candidate) => `  - ${describeOwner(candidate.record)} at ${candidate.record.mountPath}`)
    .join("\n");
}

/**
 * The slug IS recorded, but for other owners than the acting scope. `unmount`
 * says the rows are "mounted", `remount` that they are "recorded" — the drive
 * may be dead by then — and both name the same remedy.
 */
export function ownedElsewhereMessage(
  slug: string,
  candidates: readonly { readonly record: MountRecord }[],
  scope: MountScope,
  state: "mounted" | "recorded"
): string {
  return (
    `No mount of "${slug}" is recorded for ${describeScope(scope)}, but it is ${state} for:\n` +
    `${candidateList(candidates)}\nSwitch to the owning profile/org (nexus auth switch / nexus auth use-org) and retry.`
  );
}

/**
 * What `mount <slug>` says when this scope already holds a LIVE mount of it.
 *
 * Pure, and here rather than inline in the action, for the reason
 * {@link unmountMissMessage} states: this text IS the remedy, and inside a
 * commander action nothing can assert it. Three situations, three different
 * ways out, written as early returns because advice that does not hold for the
 * caller reading it is worse than none:
 *
 *   - an OWNED row: it is theirs, so "unmount it first" is safe to say.
 *   - an UNOWNED row and an IDENTIFIED caller: the anonymous base-URL bucket is
 *     already unreachable for them, so the only unowned row left to match is a
 *     legacy bare-slug entry from before org scoping. Logging in is what put
 *     them here, so it cannot be the fix — name the row and leave the judgement
 *     with the one person who can make it.
 *   - an UNOWNED row and an ANONYMOUS caller: every raw `--api-key` caller with
 *     no NEXUS_ORGANIZATION_ID shares one entry per base URL + slug, so the row
 *     may be someone else's. Identifying themselves is the real escape: it
 *     moves them to a key of their own and `scopeCandidateKeys` stops offering
 *     them this bucket at all.
 */
export function alreadyMountedMessage(
  slug: string,
  record: MountRecord,
  scope: MountScope
): string {
  const head =
    `Workspace "${slug}" is already mounted at ${record.mountPath} for ` +
    `${describeOwner(record)}. `;
  if (record.orgId || record.profile) return `${head}Unmount it first.`;
  if (scope.orgId || scope.profile) {
    return (
      `${head}That record predates org-scoped mounts and names no organization, so the ` +
      `CLI cannot tell whether it is yours. Unmount it only if you know it is — ` +
      `otherwise mount at a different path with --at.`
    );
  }
  return (
    `${head}That record names no organization: mounts made with a raw ` +
    `--api-key/NEXUS_API_KEY and no NEXUS_ORGANIZATION_ID all share one registry ` +
    `entry per base URL + slug, so it may belong to a different org than yours. ` +
    "Run `nexus auth login` or set NEXUS_ORGANIZATION_ID so the two can be told " +
    `apart — do not unmount it unless you know it is yours.`
  );
}

/** What `mount` says when another scope's row already holds the mount POINT. */
export function mountPointTakenMessage(
  mountPath: string,
  other: MountRecord,
  slug: string
): string {
  return (
    `Mount point ${mountPath} is already in use by ${describeOwner(other)}'s mount of ` +
    `"${other.slug}". Mount points are machine-wide, whatever org a row belongs to. ` +
    `Mount "${slug}" elsewhere with --at <path>, or unmount that workspace first.`
  );
}

export function unmountMissMessage(
  slug: string,
  candidates: readonly { readonly record: MountRecord }[],
  scope?: MountScope
): string {
  const list = candidateList(candidates);

  // Unknown scope covers a typo'd `--profile` (the lookup throws and
  // resolveScopeBestEffort swallows it), a raw `--api-key` with no
  // NEXUS_ORGANIZATION_ID, and a machine with no profile at all. `unmount`
  // detaches a real drive, so name the owners and make the user pick rather than
  // acting on a guess — including when there is only ONE candidate, which is
  // exactly the case where guessing looks safest and is still someone else's
  // mount.
  if (!scope) {
    return (
      `"${slug}" is mounted, but the active org could not be resolved, so the CLI cannot ` +
      `tell whose mount to detach:\n${list}\nRe-run with --profile <name> (or set ` +
      `NEXUS_ORGANIZATION_ID) to pick one.`
    );
  }

  if (candidates.every((c) => !c.record.orgId && !c.record.profile)) {
    return (
      `No mount of "${slug}" is recorded for ${describeScope(scope)}. It is mounted ` +
      `without an organization:\n${list}\nThat row was written by a caller with no ` +
      `resolvable org, so there is no profile or org to switch to. Re-run with ` +
      `--api-key and no NEXUS_ORGANIZATION_ID to act as that caller, or unmount the ` +
      `path directly with your platform tool (umount / fusermount -u).`
    );
  }

  return ownedElsewhereMessage(slug, candidates, scope, "mounted");
}
