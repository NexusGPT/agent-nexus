import { createMountDir } from "./create-mount-dir";
import type { MountOutcome } from "./mount-outcome";
import { removeCreatedDirs } from "./remove-created-dirs";

/**
 * Create the mount point, run the mounter, and take the directories back when
 * it fails — whatever failed, a mint or the spawn — so a mount that never came
 * up leaves the disk as it found it. What the user created (`--at ./ws`) is
 * never removed: only what this call made.
 */
export async function mountOnto(
  mountPath: string,
  mounter: () => Promise<MountOutcome>
): Promise<MountOutcome> {
  const created = createMountDir(mountPath);
  try {
    return await mounter();
  } catch (error) {
    removeCreatedDirs(mountPath, created);
    throw error;
  }
}
