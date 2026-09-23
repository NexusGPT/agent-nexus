import fs from "node:fs";
import path from "node:path";

import { isNoSuchFile } from "./is-no-such-file";

/**
 * Every file under `root`, with an ABSENT root answering `[]` and an unreadable
 * one THROWING.
 *
 * 🔴 The two are not the same answer, and collapsing them deletes saves. Both
 * callers below feed `unmount`, which reads "no entries" as "nothing to lose"
 * and then `rmSync(recursive, force)` the cache. A `readdirSync` can fail for
 * reasons that have nothing to do with emptiness — EACCES on an entry a `sudo`
 * run left behind, EMFILE, EIO — and each one would present a full cache as an
 * empty one. `itemIsPending` below already fails safe for exactly this reason;
 * this is the same rule one level up, at the directory read.
 */
export function filesUnder(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (isNoSuchFile(error)) return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}
