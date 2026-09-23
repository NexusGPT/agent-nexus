import fs from "node:fs";
import path from "node:path";

/**
 * Remove what `createMountDir` created — the mount point and every parent up
 * to `createdRoot` — as long as each is empty. A directory the user made
 * themselves (`--at ./ws`) is never touched: it was not created here.
 */
export function removeCreatedDirs(mountPath: string, createdRoot: string | null): void {
  if (createdRoot === null) return;
  let current = mountPath;
  for (;;) {
    try {
      if (fs.existsSync(current)) {
        if (fs.readdirSync(current).length > 0) return;
        fs.rmdirSync(current);
      }
    } catch {
      return;
    }
    if (current === createdRoot) return;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
