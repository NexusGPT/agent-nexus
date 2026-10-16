import { Command } from "commander";

import { buildRootProgram } from "../root-program";

/**
 * The POPULATION the shadowing gate walks: the real command tree, and the real
 * root program's own flags.
 *
 * 🔴 DERIVED FROM THE LIVE OBJECT, never from a file list, a path key or a
 * source scan — so a command is in the population the moment it is REGISTERED,
 * and no amount of moving files around can drop one out.
 *
 * `buildRootProgram()` is the SAME function the binary calls; importing it does
 * not run the CLI, because `index.ts` guards its parse on `require.main ===
 * module`. So this walks the object a user's command actually meets,
 * program-level options included.
 *
 * It USED to read `src/index.ts` as text and regex the `.option("--x"` calls,
 * because the program could not be imported without running it. That derivation
 * was wrong in a way a source scan cannot see: `--version` is declared by
 * `.version()`, not by `.option()`, and commander registers it into
 * `program.options` all the same. The regex found 8 globals where the program
 * has 9, so a shadow of `--version` would have been missed outright.
 *
 * `--help` is absent from the set, and that is correct rather than a second gap:
 * commander creates `_helpOption` lazily and never registers it into `options`,
 * and every command grows its own, so `--help` cannot be shadowed in the sense
 * this gate means.
 */

/** Every long flag the ROOT program declares, e.g. `--json`, `--api-key`, `--version`. */
export function globalOptionFlags(root: Command): string[] {
  return root.options
    .map((option) => option.long)
    .filter((long): long is string => Boolean(long))
    .sort();
}

/**
 * The whole tree, memoised.
 *
 * `buildRootProgram()` registers every namespace and then runs
 * `applyBodySatisfiesRequired`, which flips `mandatory` on existing options and
 * adds a `preAction` hook. Neither adds, removes nor renames an option, so this
 * walk sees the same option set before and after that pass — asserted in the
 * colocated test rather than assumed.
 */
let cachedTree: Command | null = null;

export function buildCommandTree(): Command {
  cachedTree ??= buildRootProgram();
  return cachedTree;
}
