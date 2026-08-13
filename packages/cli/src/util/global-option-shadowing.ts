import { Command } from "commander";

import { buildRootProgram } from "../root-program";

/**
 * A SUBCOMMAND OPTION THAT SHARES A LONG NAME WITH A GLOBAL NEVER RECEIVES A
 * VALUE — AND THE VALUE IT DID NOT RECEIVE IS SENT SOMEWHERE ELSE.
 *
 * ── The mechanism ────────────────────────────────────────────────────────────
 *
 * `src/index.ts` does NOT call `enablePositionalOptions()`, deliberately: the
 * root epilogue promises "Global flags work anywhere in the line, before or
 * after the subcommand", and `--json` after a subcommand is used everywhere. The
 * cost of that promise is that the ROOT parses its own options across the whole
 * of argv. When a subcommand declares an option with the same long name, the
 * root consumes the value first and the subcommand's slot stays `undefined`.
 *
 * Two failures follow, and they present in opposite directions:
 *
 *   - The option is `requiredOption` → commander refuses the command outright
 *     with "required option '--x' not specified", naming a flag the user DID
 *     pass. `custom-model create` was unusable by every documented route.
 *   - The option is optional → the command runs, its own field is silently
 *     absent from the request body, and the value the user typed is applied to
 *     the CLI's own transport instead. `custom-model update --base-url <the
 *     provider's host> --api-key <the provider's key>` sent the CLI's OWN
 *     authenticated Nexus request to the third-party host the user named, with
 *     the provider key in the `api-key` header. Proven against a local sink on
 *     2026-08-13: `PATCH /v1/api/public/v1/custom-models/cm-fake` arrived at
 *     127.0.0.1 carrying the key that was meant for the model provider.
 *
 * The second one is a credential disclosure to a host of the user's naming, and
 * nothing about the run looks wrong: the CLI prints success.
 *
 * ── Why this is a GATE and not a note ────────────────────────────────────────
 *
 * The class was already known and already worked around once, per command:
 * `auth login`'s action carries a comment explaining the same commander
 * behaviour and merges `optsWithGlobals()` to recover the value. A per-command
 * workaround does not stop the next collision, and the next collision was
 * `custom-model`, added later, by someone who had no reason to read `auth.ts`.
 *
 * So the population is DERIVED (walk the real tree; a new command is in it the
 * moment it is registered) and the exceptions are DECLARED
 * ({@link SHADOWED_OPTION_EXCEPTIONS}). An undeclared shadow is a failing test,
 * not a default.
 *
 * ── When merging is right, and when renaming is the only repair ──────────────
 *
 * Merge the global (`auth login`) only when the two options mean THE SAME
 * THING — there, both `--api-key` values are "a Nexus API key", so taking the
 * global's value is correct.
 *
 * RENAME (`custom-model`) when they mean DIFFERENT things. `--base-url` on the
 * root is the Nexus API; on `custom-model create` it was a third party's
 * inference endpoint. Merging those would have hard-wired the exposure instead
 * of removing it.
 */

export interface ShadowedOption {
  /** Space-joined command path, e.g. `custom-model create`. */
  commandPath: string;
  /** The colliding long flag, e.g. `--api-key`. */
  flag: string;
}

/** `<command path> <flag>` → why the shadow is deliberate and how it is handled. */
export const SHADOWED_OPTION_EXCEPTIONS: Readonly<Record<string, string>> = {
  "auth login --api-key":
    "Same meaning as the global: both are a Nexus API key. The action merges " +
    "`command.optsWithGlobals()` over its own opts, so the user's value is read " +
    "from whichever slot commander filled.",
  "auth login --profile":
    "Same meaning as the global: both name a profile. Recovered by the same " +
    "`optsWithGlobals()` merge in the action."
};

/**
 * The root program, built but never parsed.
 *
 * `buildRootProgram()` is the SAME function the binary calls; importing it does
 * not run the CLI, because `index.ts` guards its parse on `require.main ===
 * module`. So this gate walks the object a user's command actually meets,
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
 * this file means.
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

/** Every descendant option whose long flag collides with a root global. */
export function collectShadowedOptions(
  root: Command,
  globalFlags: readonly string[]
): ShadowedOption[] {
  const globals = new Set(globalFlags);
  const found: ShadowedOption[] = [];

  const walk = (command: Command, trail: readonly string[]): void => {
    for (const child of command.commands) {
      const childTrail = [...trail, child.name()];
      for (const option of child.options) {
        if (option.long && globals.has(option.long)) {
          found.push({ commandPath: childTrail.join(" "), flag: option.long });
        }
      }
      walk(child, childTrail);
    }
  };

  walk(root, []);
  return found.sort((a, b) =>
    `${a.commandPath} ${a.flag}`.localeCompare(`${b.commandPath} ${b.flag}`)
  );
}

/** Shadows that carry no entry in {@link SHADOWED_OPTION_EXCEPTIONS}. */
export function undeclaredShadowedOptions(shadows: readonly ShadowedOption[]): ShadowedOption[] {
  return shadows.filter((s) => !(`${s.commandPath} ${s.flag}` in SHADOWED_OPTION_EXCEPTIONS));
}
