import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module whose `import.meta.url` is passed is the program node was
 * asked to run — the ESM spelling of `require.main === module`.
 *
 * A script that both EXPORTS (for its spec) and RUNS (from CI) needs this
 * question answered, and every hand-rolled answer in this repository was wrong
 * the same way: it compared `import.meta.url` with `process.argv[1]`. Node
 * resolves a module's URL through symlinks and leaves `argv[1]` as typed, so
 * whenever the invoking path crosses a symlink — macOS's `/tmp` is one, and so
 * is a copied tree whose directory links back into a worktree — the comparison
 * is false. The module evaluates, `main()` never runs, nothing is printed and
 * the process exits 0. A verdict script failing that way reads exactly like a
 * clean pass.
 *
 * So both sides go through `realpathSync`. Either side alone is not enough:
 * `node --preserve-symlinks-main` leaves `import.meta.url` unresolved too.
 *
 * `scripts/__tests__/entry-checks-resolve-symlinks.spec.ts` refuses the
 * symlink-blind spellings of this comparison anywhere in the tree, and
 * `scripts/__tests__/is-entrypoint.spec.ts` runs a real script through a
 * symlinked path to prove this one answers `true`.
 *
 * Reached by a relative import from `scripts/`, `.github/actions/`,
 * `deployment/ci-monitoring/` and `apps/backend/scripts/`. Two callers run from a
 * SPARSE checkout and a third is copied into the public package mirror, so those
 * checkouts and the mirror's root-path list each name this file explicitly; the
 * first spec above holds them to it.
 *
 * @param {string} importMetaUrl the caller's own `import.meta.url`
 * @param {string | undefined} [invokedPath] the path node was asked to run;
 *   `process.argv[1]` unless a test supplies one
 * @returns {boolean} `false` when there is no such path (`node -e`, a REPL) or
 *   either side cannot be resolved — a module that cannot prove it is the
 *   program does not run as one
 */
export function isEntrypoint(importMetaUrl, invokedPath = process.argv[1]) {
  if (typeof invokedPath !== "string" || invokedPath === "") return false;
  try {
    return realpathSync(invokedPath) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
