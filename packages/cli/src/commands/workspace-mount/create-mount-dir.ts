import fs from "node:fs";
import path from "node:path";

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
export function createMountDir(mountPath: string): string | null {
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
