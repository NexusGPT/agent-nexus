import path from "node:path";

import { filesUnder } from "./files-under";

/** True while the cache holds any item at all — the state `unmount` never deletes. */
export function cacheHoldsEntries(cacheDir: string): boolean {
  return ["vfs", "vfsMeta"].some((tree) => {
    try {
      return filesUnder(path.join(cacheDir, tree)).length > 0;
    } catch {
      // Present and unreadable: the cache is not known to be empty, so it stays.
      return true;
    }
  });
}
