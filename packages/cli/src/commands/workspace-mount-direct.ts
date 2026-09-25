import fs from "node:fs";

import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { createClient } from "../client";
import { loadConfig, setProfileOrganization } from "../config";
import { failure, invalidInput } from "../errors";
import {
  describeOwner,
  type Engine,
  ensureStateSubdir,
  type MountRecord,
  type MountScope
} from "../mount-registry";
import { color } from "../output";
import { writeSecretFile } from "../util/secret-file";
import { awsConfigFor } from "../workspace-direct-mount/aws-config";
import { AWS_CONFIG_REFUSAL_TEXT } from "../workspace-direct-mount/aws-config-refusal";
import { cacheHoldsEntries } from "../workspace-direct-mount/cache-holds-entries";
import { writeCacheOwner } from "../workspace-direct-mount/cache-owner";
import { cacheProvenanceRefusal } from "../workspace-direct-mount/cache-provenance-refusal";
import { checkRefreshPath } from "../workspace-direct-mount/check-refresh-path";
import { countPendingUploads } from "../workspace-direct-mount/count-pending-uploads";
import { directMountArgv } from "../workspace-direct-mount/direct-mount-argv";
import { discardPendingSavesHint } from "../workspace-direct-mount/discard-pending-saves-hint";
import type { InstallPolicy } from "../workspace-direct-mount/install/install-policy";
import type { RcloneBinary } from "../workspace-direct-mount/managed-rclone";
import { mintBodyFor } from "../workspace-direct-mount/mint-body";
import { mountFix } from "../workspace-direct-mount/mount-fix";
import { isMountId } from "../workspace-direct-mount/mount-id";
import type { MountSession } from "../workspace-direct-mount/mount-session";
import { describePendingUploads } from "../workspace-direct-mount/pending-uploads-unknown";
import { rcloneEnvFor } from "../workspace-direct-mount/rclone-env";
import { readSession } from "../workspace-direct-mount/read-session";
import { remountFix } from "../workspace-direct-mount/remount-fix";
import {
  DIRECT_MOUNT_INTRO_MARKER,
  MOUNT_CACHE_DIR,
  sessionPathsFor
} from "../workspace-direct-mount/session-paths";
import { stableNodePath } from "../workspace-direct-mount/stable-node-path";
import { toVolumeName } from "../workspace-direct-mount/volume-name";
import { writeSession } from "../workspace-direct-mount/write-session";
import { ensureRcloneCanMount } from "./workspace-mount/ensure-rclone-can-mount";
import { isReadOnlyKind } from "./workspace-mount/is-read-only-kind";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import type { MountPlan } from "./workspace-mount/mount-plan";
import { spawnRcloneMount } from "./workspace-mount/spawn-rclone-mount";

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

declare const acceptedAwsConfig: unique symbol;

/**
 * The aws.config text `directAwsConfigOrRefuse` accepted. `mountDirect` writes
 * this to the session directory verbatim, and the brand is what keeps a string
 * that skipped `awsConfigFor`'s refusals out of that write.
 */
export type AcceptedAwsConfig = string & { readonly [acceptedAwsConfig]: true };

/**
 * The credential_process line for this mount, refused before any mint when the
 * node binary or the CLI entry cannot be written into it. Both inputs are known
 * before the first network call, so the refusal costs no minted key.
 */
function directAwsConfigOrRefuse(mountId: string): AcceptedAwsConfig {
  const execPath = stableNodePath();
  const entry = process.argv[1];
  const config = awsConfigFor({ execPath, entry, mountId });
  // The brand is minted here and nowhere else: `awsConfigFor` has just refused
  // every character its ini reader or shell would misread.
  if (config.ok) return config.text as AcceptedAwsConfig;
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
 * A CODE workspace is refused on the direct engine outright. Its S3 prefix
 * holds engine-owned `.checkouts/` generations beside the files, the server
 * grades every human key `read` on it, and a drive that accepted saves under
 * `--vfs-cache-mode writes` would drop them at upload — the silent-loss shape.
 * The WebDAV engine mounts it read-only through Nexus instead.
 */
export function refuseCodeWorkspaceOnDirect(slug: string, kind: WorkspaceKind): void {
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
  readonly awsConfig: AcceptedAwsConfig;
  readonly binary: RcloneBinary;
  readonly client: ReturnType<typeof createClient>;
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
export async function mountDirect(request: DirectMountRequest): Promise<MountOutcome> {
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
      request.binary,
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
export function printMountFooter(engine: Engine, slug: string): void {
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
 * A DEAD direct row about to be replaced still owns two things on disk: its
 * session directory (a key that stays valid until it expires) and its cache.
 * Saves in that cache upload only through a direct mount on the SAME mount id,
 * so any other replacement is refused while they exist; otherwise the session
 * goes the way `unmount` sends it and the empty cache with it.
 */
export function retireDeadDirectRow(record: MountRecord, replacement: MountPlan): void {
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
 * Delete a direct mount's session directory — the triplet and the
 * credential_process line — and its cache directory ONLY when that holds
 * nothing. rclone re-uploads dirty cache items on its next run with the same
 * cache directory, and `umount` never waits for the write-back, so a cache
 * with anything in it is the only copy of saves that have not reached the
 * workspace: it stays, counted, until `remount` drains it.
 */
export function removeDirectSession(record: MountRecord): DirectLeftovers {
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

/** What the direct engine settles locally before its first network call. */
export interface DirectPlan {
  readonly mountId: string;
  readonly pins: DirectPins;
  readonly awsConfig: AcceptedAwsConfig;
  /** The rclone the preflight probed — the only one the spawn may run. */
  readonly binary: RcloneBinary;
}

/**
 * The direct engine's local refusals, in the order they are cheapest: the pins
 * its renewal needs, the credential_process line its renewal runs through, and
 * last the rclone build and FUSE layer its spawn needs — last because that one
 * may download and install software, which a refusal after it would waste.
 * `mount` and `remount` both settle through here, so the same machine is
 * refused in the same order by both.
 */
export async function planDirectMount(
  scope: MountScope,
  mountId: string,
  policy: InstallPolicy
): Promise<DirectPlan> {
  const pins = directPins(scope);
  const awsConfig = directAwsConfigOrRefuse(mountId);
  const binary = await ensureRcloneCanMount("direct", policy);
  return { mountId, pins, awsConfig, binary };
}
