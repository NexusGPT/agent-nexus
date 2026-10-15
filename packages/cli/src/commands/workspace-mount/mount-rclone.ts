import type { MountRecord } from "../../mount-registry";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import type { GatewayMountRequest } from "./gateway-mount-request";
import { spawnRcloneMount } from "./spawn-rclone-mount";

/**
 * Mount the Nexus WebDAV gateway through rclone. The API key travels in
 * rclone's environment (`RCLONE_WEBDAV_HEADERS`), never in argv, so the process
 * list does not show it. Tuned for freshness over caching — it is a live
 * shared drive.
 */
export async function mountRclone(
  request: GatewayMountRequest,
  binary: RcloneBinary
): Promise<MountRecord> {
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
  const pid = await spawnRcloneMount(binary, slug, args, env);
  return {
    slug,
    engine: "rclone",
    mountPath,
    baseUrl,
    pid,
    mountedAt: new Date().toISOString()
  };
}
