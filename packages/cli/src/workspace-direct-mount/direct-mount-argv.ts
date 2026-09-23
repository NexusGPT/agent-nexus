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
