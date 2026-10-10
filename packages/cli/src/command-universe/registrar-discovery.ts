/**
 * FINDING THE ROOT REGISTRARS ON DISK — the population's entry point.
 *
 * One concern: enumerate `src/commands/` and return every `register*` export
 * that attaches to the ROOT program. Arity is the discriminator and it is a
 * property of the code rather than of a naming convention.
 *
 * WHAT BELONGS HERE: the directory resolution, the `DiscoveredRegistrar` shape,
 * and the discovery walk. The 🚨 on `commandsDirectory` is about this file's own
 * location and must move with it if the file ever moves again.
 *
 * WHAT DOES NOT: anything that RUNS a registrar. Running them is
 * `derive-modules.ts`, which is also where the question "is this registrar
 * actually wired into the real CLI" is answered — discovery cannot know that
 * and does not claim to.
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Command } from "commander";

/**
 * The directory holding one module per command namespace.
 *
 * `__dirname` is unavailable under ESM and `import.meta.url` is a syntax error
 * once tsup emits CJS, so neither can be written literally in a file that is
 * both bundled into `dist/` and imported by vitest. This module is never part
 * of the shipped bundle — only the spec, `scripts/command-universe.ts` and the
 * docs generator import it — so it is free to resolve its own location the ESM
 * way.
 *
 * 🚨 THE `".."` IS LOAD-BEARING AND IS A PROPERTY OF WHERE THIS FILE SITS. This
 * module lives one directory below `src/`, so resolving `"commands"` against its
 * own location would name `src/command-universe/commands` — which does not
 * exist. `readdirSync` THROWS on a missing directory rather than returning an
 * empty list, so this particular mistake cannot go quiet; a walk that returned
 * zero registrars would have turned every derived population into an empty one
 * while every arm asserting `toEqual([])` stayed green.
 */
function commandsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "commands");
}

/** A registrar that hangs a whole namespace off the root program. */
type RootRegistrar = (program: Command) => void;

export interface DiscoveredRegistrar {
  /** Basename inside `src/commands/`, e.g. `apps.ts`. */
  readonly module: string;
  /** Repository-relative path, for a docs page's `sourceRefs` frontmatter. */
  readonly sourcePath: string;
  /** The exported function's name, e.g. `registerAppsCommands`. */
  readonly name: string;
  readonly register: RootRegistrar;
}

/**
 * Every `register*` export in `src/commands/` that attaches to the ROOT program.
 *
 * Arity is the discriminator, and it is a property of the code rather than of a
 * naming convention: a root registrar takes `(program)`, while a nested one —
 * `registerVibeCostSafetyCommands(admin, program)` — takes its parent first and
 * is reached through its own namespace's registrar, never from here. Calling a
 * nested one against the root would graft `vibe-cost-safety` on as a top-level
 * command that does not exist.
 */
export async function discoverRootRegistrars(): Promise<DiscoveredRegistrar[]> {
  const directory = commandsDirectory();
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".conformance.ts"))
    .sort();

  const found: DiscoveredRegistrar[] = [];
  for (const file of files) {
    const loaded: Record<string, unknown> = await import(
      /* @vite-ignore */ pathToFileURL(join(directory, file)).href
    );
    for (const [name, value] of Object.entries(loaded)) {
      if (!/^register[A-Z]\w*$/.test(name)) continue;
      if (typeof value !== "function") continue;
      if (value.length !== 1) continue;
      found.push({
        module: file,
        sourcePath: `packages/cli/src/commands/${file}`,
        name,
        register: value as RootRegistrar
      });
    }
  }
  return found;
}
