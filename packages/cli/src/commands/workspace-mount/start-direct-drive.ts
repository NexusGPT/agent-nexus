import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";

import { failure } from "../../errors";
import { ensureStateSubdir } from "../../mount-registry";
import { writeSecretFile } from "../../util/secret-file";
import { writeCacheOwner } from "../../workspace-direct-mount/cache-owner";
import { checkRefreshPath } from "../../workspace-direct-mount/check-refresh-path";
import { directMountArgv } from "../../workspace-direct-mount/direct-mount-argv";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { OR_DROP_DIRECT } from "../../workspace-direct-mount/or-drop-direct";
import { rcloneEnvFor } from "../../workspace-direct-mount/rclone-env";
import { MOUNT_CACHE_DIR, type SessionPaths } from "../../workspace-direct-mount/session-paths";
import { writeSession } from "../../workspace-direct-mount/write-session";
import { spawnRcloneMount } from "./spawn-rclone-mount";

/** Everything putting a direct drive on its mount point needs. */
export interface StartDirectDriveInput {
  readonly slug: string;
  readonly mountPath: string;
  readonly mountId: string;
  readonly paths: SessionPaths;
  readonly session: MountSession;
  readonly minted: WorkspaceMountCredentials;
  /** The access the drive actually comes up with — asked for, or all the server granted. */
  readonly readOnly: boolean;
  /** True when the admin-shared copy is the target; recorded beside the cache. */
  readonly shared: boolean;
  readonly awsConfig: string;
  readonly binary: RcloneBinary;
}

/**
 * Write the three files a direct drive renews itself through, prove the refresh
 * path, and spawn rclone. Returns the pid the registry records — `undefined`
 * when the spawn produced none, exactly as `spawnRcloneMount` reports it.
 *
 * Everything here is INSIDE `mountDirect`'s one catch, so a drive that never
 * came up leaves no credential on disk. The bucket never enters argv: rclone is
 * pointed at the alias `nxws:`, which resolves to the bucket only inside the
 * environment `rcloneEnvFor` builds.
 */
export async function startDirectDrive(input: StartDirectDriveInput): Promise<number | undefined> {
  const { slug, paths, session, minted } = input;
  writeSession(session);
  // The cache states which copy of the slug it belongs to, so a later mount of
  // the OTHER copy is refused instead of draining these saves into the wrong
  // workspace. Written beside the cache, not in the session: a dirty cache
  // deliberately outlives its session, and this fact has to outlive it too.
  writeCacheOwner(paths.cacheOwnerFile, { shared: input.shared });
  writeSecretFile(paths.awsConfigFile, input.awsConfig);

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
  return spawnRcloneMount(
    input.binary,
    `${slug}-${input.mountId}`,
    directMountArgv({
      mountPath: input.mountPath,
      cacheDir: paths.cacheDir,
      slug,
      volumeName: session.volumeName,
      readOnly: input.readOnly
    }),
    rcloneEnvFor({
      inherited: process.env,
      awsConfigFile: paths.awsConfigFile,
      mountId: input.mountId,
      region: minted.storage.region,
      bucket: minted.storage.bucket,
      prefix: minted.storage.prefix
    })
  );
}
