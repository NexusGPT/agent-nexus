import { Command } from "commander";

import type { ShadowedOption } from "./global-option-shadowing.exceptions";

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
 * So the population is DERIVED — walk the real tree, in
 * `global-option-shadowing.tree.ts`; a new command is in it the moment it is
 * registered — and the exceptions are DECLARED, in
 * `global-option-shadowing.exceptions.ts`. An undeclared shadow is a failing
 * test, not a default.
 *
 * This file is the WALK that turns the one into findings against the other.
 */

export {
  SHADOWED_OPTION_EXCEPTIONS,
  type ShadowedOption,
  undeclaredShadowedOptions
} from "./global-option-shadowing.exceptions";
export { buildCommandTree, globalOptionFlags } from "./global-option-shadowing.tree";

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
