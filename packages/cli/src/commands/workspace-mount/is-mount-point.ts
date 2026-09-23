import { execFileSync } from "node:child_process";
import fs from "node:fs";

/** True if `mountPath` is currently an active mount point (used for native mounts). */
export function isMountPoint(mountPath: string): boolean {
  // macOS lists the realpath in the mount table (e.g. /tmp → /private/tmp), so
  // compare against the resolved path — otherwise a live native mount under a
  // symlinked dir reads as "not mounted" (wrong `status`, bypassed re-mount
  // guard). Fall back to the raw path if it can't be resolved (e.g. unmounted).
  let resolved = mountPath;
  try {
    resolved = fs.realpathSync(mountPath);
  } catch {
    /* keep the raw path */
  }
  try {
    const out = execFileSync("mount", [], { encoding: "utf-8" });
    return out
      .split("\n")
      .some((line) => line.includes(` on ${resolved} `) || line.includes(` on ${mountPath} `));
  } catch {
    return false;
  }
}
