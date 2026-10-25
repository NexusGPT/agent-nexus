import path from "node:path";

import { invalidInput } from "../../errors";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { classifyWin32MountPoint, insideOneDrive } from "./win32/win32-mount-point";

/**
 * The mount point `mount` will use: `--at` when given, the default folder
 * otherwise. macOS and Linux resolve it as they always did. Windows reads it
 * as a string first — a drive letter stays `X:` (resolving it would turn it
 * into `X:\<cwd>`), and the four shapes Windows cannot hold a drive on are
 * refused before any auth.
 */
const MOUNT_PATH_FOR = {
  darwin: posixMountPath,
  linux: posixMountPath,
  win32: win32MountPath
} as const satisfies Record<MountPlatform, (at: string | undefined, fallback: string) => string>;

export function resolveMountPath(at: string | undefined, fallback: string): string {
  return MOUNT_PATH_FOR[mountPlatformOf(process.platform)](at, fallback);
}

function posixMountPath(at: string | undefined, fallback: string): string {
  return path.resolve(at || fallback);
}

/**
 * `--at` and the default folder get one reading: the default ends in the slug,
 * and a slug such as `con` or `docs.` is a name Windows cannot hold either.
 * The resolved folder is read again: a relative `--at` typed inside a network
 * folder resolves to a UNC path.
 */
function win32MountPath(at: string | undefined, fallback: string): string {
  const requested = at || fallback;
  const point = classifyWin32MountPoint(requested);
  if (point.kind === "refused") throw invalidInput(point.message, point.hint);
  if (point.kind === "drive") return point.letter;
  const resolved = path.resolve(requested);
  const resolvedPoint = classifyWin32MountPoint(resolved);
  if (resolvedPoint.kind === "refused") {
    throw invalidInput(resolvedPoint.message, resolvedPoint.hint);
  }
  const oneDrive = insideOneDrive(resolved, process.env);
  if (oneDrive !== null) {
    throw invalidInput(
      `${resolved} is inside OneDrive (${oneDrive}), which would try to sync the whole drive a second time.`,
      "Pick a folder outside OneDrive, or a drive letter: --at X:"
    );
  }
  return resolved;
}
