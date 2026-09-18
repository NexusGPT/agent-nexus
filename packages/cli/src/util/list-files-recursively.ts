import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every file under `root`, AT ANY DEPTH, whose base name `keep` accepts.
 *
 * Returned relative to `root`, with `/` separators and sorted, so a gate can
 * print the path as a finding and `join(root, path)` to read it.
 *
 * ── WHY THE SOURCE GATES SHARE THIS RATHER THAN EACH CALLING `readdirSync` ────
 *
 * A text gate over `src/commands` that lists only the directory's top level has
 * a population that shrinks the moment a command moves into a subdirectory —
 * and a gate asserting "no offender" over a smaller population stays green. So
 * the hole opens silently, in the direction that reads as a pass. One walker,
 * recursive by construction, is what keeps every gate's population the same
 * shape as the tree.
 *
 * `keep` receives the BASE NAME, which is what each gate's `readdirSync` filter
 * received before it moved here, so every exclusion keeps its exact meaning.
 *
 * Recursion is by hand rather than `readdirSync(…, { recursive: true })`: that
 * option's `Dirent.parentPath` needs Node 20.12, and this package declares
 * `>=18`.
 */
export function listFilesRecursively(root: string, keep: (fileName: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (prefix: string): void => {
    for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && keep(entry.name)) out.push(path);
    }
  };
  visit("");
  return out.sort();
}
