import fs from "node:fs";

import { createMountDir } from "./create-mount-dir";
import type { MountOutcome } from "./mount-outcome";
import { removeCreatedDirs } from "./remove-created-dirs";

/**
 * Create the mount point, run the mounter, and take the directories back when
 * it fails — whatever failed, a mint or the spawn — so a mount that never came
 * up leaves the disk as it found it. What the user created (`--at ./ws`) is
 * never removed: only what this call made, and an empty folder Windows had to
 * give up for the mounter is put back.
 */
export async function mountOnto(
  mountPath: string,
  mounter: () => Promise<MountOutcome>
): Promise<MountOutcome> {
  const prepared = createMountDir(mountPath);
  try {
    return await mounter();
  } catch (error) {
    removeCreatedDirs(mountPath, prepared.createdRoot);
    if (prepared.removedLeaf) putBack(mountPath);
    throw error;
  }
}

/** Best effort, like the removal beside it: the mount's own failure is the one reported. */
function putBack(mountPath: string): void {
  try {
    fs.mkdirSync(mountPath, { recursive: true });
  } catch {
    /* the folder stays removed */
  }
}
