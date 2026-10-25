import fs from "node:fs";
import path from "node:path";

import { failure } from "../../errors";
import { errnoOf } from "../../workspace-direct-mount/errno-of";
import { isDriveLetter } from "../../workspace-direct-mount/mount-path-key";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";

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

function refuseNonEmpty(mountPath: string): void {
  if (fs.existsSync(mountPath) && fs.readdirSync(mountPath).length > 0) {
    throw new Error(
      `Mount point ${mountPath} is not empty. Choose another with --at <path> or clear it first.`
    );
  }
}

/** What preparing a mount point changed on disk, so a failed mount can put it back. */
export interface PreparedMountDir {
  /** The highest directory this call created, or null when everything existed. */
  readonly createdRoot: string | null;
  /** True when an existing, empty mount point was removed so the mounter can create it itself. */
  readonly removedLeaf: boolean;
}

/** mount_webdav and FUSE want an EXISTING, EMPTY directory. */
function prepareLeaf(mountPath: string): PreparedMountDir {
  refuseNonEmpty(mountPath);
  const createdRoot = firstMissingAncestor(mountPath);
  fs.mkdirSync(mountPath, { recursive: true });
  return { createdRoot, removedLeaf: false };
}

/**
 * rclone on Windows wants the parent of a folder to exist and the leaf NOT to
 * (WinFsp creates the leaf itself); a drive letter needs nothing on disk, only
 * a letter no volume holds.
 */
function prepareWin32(mountPath: string): PreparedMountDir {
  if (isDriveLetter(mountPath)) {
    if (fs.existsSync(`${mountPath}\\`)) {
      throw failure(
        "local-failed",
        `Drive letter ${mountPath} is in use.`,
        "Free that letter, or mount the workspace at another one: nexus workspace mount <slug> --at <letter>: (or a folder)."
      );
    }
    return { createdRoot: null, removedLeaf: false };
  }
  refuseNonEmpty(mountPath);
  const parent = path.dirname(mountPath);
  const createdRoot = firstMissingAncestor(parent);
  mkdirUnderControlledFolders(parent);
  const removedLeaf = fs.existsSync(mountPath);
  if (removedLeaf) fs.rmdirSync(mountPath);
  return { createdRoot, removedLeaf };
}

/**
 * Windows' Controlled Folder Access refuses a program it does not trust
 * inside Desktop, Documents and Pictures with a bare EPERM. Named, because
 * "operation not permitted" on the user's own folder reads like a bug.
 */
function mkdirUnderControlledFolders(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    if (errnoOf(error) === "EPERM" && /[\\/](desktop|documents|pictures)([\\/]|$)/i.test(dir)) {
      throw failure(
        "local-failed",
        `Windows refused to create ${dir}: Controlled Folder Access protects Desktop, Documents and Pictures.`,
        "Mount it somewhere else (nexus workspace mount <slug> --at <folder or X:>), or allow the CLI in Windows Security › Ransomware protection."
      );
    }
    throw error;
  }
}

const PREPARE_FOR = {
  darwin: prepareLeaf,
  linux: prepareLeaf,
  win32: prepareWin32
} as const satisfies Record<MountPlatform, (mountPath: string) => PreparedMountDir>;

/**
 * What a mount needs on disk before the mounter runs, per platform. A
 * non-empty directory is refused before anything is created, so a refusal
 * leaves the disk as it found it.
 *
 * Returns what it changed, so `mountOnto` can undo it when the mount then
 * fails: the directories created, and an empty folder removed on Windows.
 */
export function createMountDir(mountPath: string): PreparedMountDir {
  return PREPARE_FOR[mountPlatformOf(process.platform)](mountPath);
}
