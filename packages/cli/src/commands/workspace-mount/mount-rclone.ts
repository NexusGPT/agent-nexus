import { ensureStateSubdir, type MountRecord } from "../../mount-registry";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { secretFreeEnv } from "../../workspace-direct-mount/secret-free-env";
import { win32VolumeLabel } from "../../workspace-direct-mount/volume-name";
import { GATEWAY_CACHE_DIR, gatewayCacheDirFor } from "./gateway-cache";
import {
  cacheOf,
  davPathOf,
  type GatewayMountRequest,
  type RcloneSettlement
} from "./gateway-mount-request";
import { spawnRcloneMount } from "./spawn-rclone-mount";

/**
 * Per-platform mount flags: Windows names the volume, or Explorer labels the
 * drive `:webdav:` — cut to what a WinFsp label holds.
 */
const EXTRA_MOUNT_ARGS_FOR = {
  darwin: () => [],
  linux: () => [],
  win32: (slug) => ["--volname", win32VolumeLabel(slug)]
} as const satisfies Record<MountPlatform, (slug: string) => readonly string[]>;

/**
 * Mount the Nexus WebDAV gateway through rclone. The API key travels in
 * rclone's environment (`RCLONE_WEBDAV_HEADERS`), never in argv, so the process
 * list does not show it. Tuned for freshness over caching — it is a live
 * shared drive. The VFS cache sits in the drive's own folder, so `status` and
 * `unmount` can count the saves still waiting in it.
 */
export async function mountRclone(
  request: GatewayMountRequest,
  settled: RcloneSettlement
): Promise<MountRecord> {
  const { slug, baseUrl, apiKey, mountPath, readOnly } = request;
  ensureStateSubdir(GATEWAY_CACHE_DIR);
  // The same deny-list the direct engine spawns under: the shell's AWS_* and
  // RCLONE_* (an RCLONE_DUMP=headers would log the API key header) and the
  // NEXUS_* identity never reach rclone; the three keys below are set after it.
  const env: NodeJS.ProcessEnv = {
    ...secretFreeEnv(process.env),
    RCLONE_WEBDAV_URL: `${baseUrl}/api/dav/${davPathOf(request)}`,
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
    "5s",
    "--cache-dir",
    gatewayCacheDirFor(cacheOf(request, settled))
  ];
  if (readOnly) args.push("--read-only");
  args.push(...EXTRA_MOUNT_ARGS_FOR[mountPlatformOf(process.platform)](slug));
  // One log per mount, not per slug: two organizations' drives of one slug
  // must not share a file, nor show each other's tail on a failure.
  const pid = await spawnRcloneMount(settled.binary, `${slug}-${settled.mountId}`, args, env);
  return {
    slug,
    engine: "rclone",
    mountPath,
    baseUrl,
    mountId: settled.mountId,
    pid,
    mountedAt: new Date().toISOString()
  };
}
