import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";

import { failure } from "../../errors";
import { ensureStateSubdir } from "../../mount-registry";
import type { AcceptedAwsConfig } from "../../workspace-direct-mount/accepted-aws-config";
import { writeCacheOwner } from "../../workspace-direct-mount/cache-owner";
import { checkRefreshPath } from "../../workspace-direct-mount/check-refresh-path";
import { directMountArgv } from "../../workspace-direct-mount/direct-mount-argv";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import type { MountId } from "../../workspace-direct-mount/mount-id";
import { mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { orTheGateway } from "../../workspace-direct-mount/or-the-gateway";
import { rcloneEnvFor } from "../../workspace-direct-mount/rclone-env";
import { MOUNT_CACHE_DIR, type SessionPaths } from "../../workspace-direct-mount/session-paths";
import {
  writeSecretFileAtomically,
  writeSession
} from "../../workspace-direct-mount/write-session";
import { spawnRcloneMount } from "./spawn-rclone-mount";
import { renewalDryRunProblem } from "./win32/renewal-dry-run";

/** Everything putting a direct drive on its mount point needs. */
export interface StartDirectDriveInput {
  readonly slug: string;
  readonly mountPath: string;
  readonly mountId: MountId;
  readonly paths: SessionPaths;
  readonly session: MountSession;
  readonly minted: WorkspaceMountCredentials;
  /** The access the drive actually comes up with — asked for, or all the server granted. */
  readonly readOnly: boolean;
  /** True when the admin-shared copy is the target; recorded beside the cache. */
  readonly shared: boolean;
  readonly awsConfig: AcceptedAwsConfig;
  readonly binary: RcloneBinary;
}

/**
 * Write the files a direct drive renews itself through (on Windows, `renew.cmd`
 * too), prove the refresh path — on Windows by running `renew.cmd` once as
 * rclone's SDK will — and spawn rclone. Returns the pid the registry records — `undefined`
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
  writeSecretFileAtomically(paths.awsConfigFile, input.awsConfig.text);
  // Windows: the line names renew.cmd, so it is written before the probe reads it.
  if (input.awsConfig.renewCmd !== null) {
    writeSecretFileAtomically(paths.renewCmdFile, input.awsConfig.renewCmd);
  }

  // The same probe `credential-process --check` runs, before rclone is
  // spawned: a broken line makes rclone exit 1 with a misleading CRITICAL
  // ("is a file not a directory"), so the real cause is established here.
  const probe = checkRefreshPath(session);
  if (!probe.ok) {
    throw failure(
      "local-failed",
      `The drive's renewal path is not usable: ${probe.problem}.`,
      `Reinstall the CLI where node can run it, then mount again.${orTheGateway()}`
    );
  }

  const env = rcloneEnvFor({
    inherited: process.env,
    awsConfigFile: paths.awsConfigFile,
    mountId: input.mountId,
    region: minted.storage.region,
    bucket: minted.storage.bucket,
    prefix: minted.storage.prefix,
    platform: mountPlatformOf(process.platform)
  });
  // Windows: run renew.cmd once as rclone's SDK will, under rclone's env.
  if (input.awsConfig.renewCmd !== null) {
    const problem = renewalDryRunProblem(paths.renewCmdFile, env, minted.credentials.accessKeyId);
    if (problem !== null) {
      throw failure(
        "local-failed",
        `The drive's hourly renewal does not run on this machine: renew.cmd — ${problem}.`,
        `Check the Command Processor AutoRun registry value, then mount again.${orTheGateway()}`
      );
    }
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
    env
  );
}
