import type { Command } from "commander";

import { placeholderFor } from "../commands/json-one-document.scan";

/**
 * Options that would tell the command it has already been confirmed.
 *
 * `--force` is skipped for the same reason `--yes` is: `confirmDestructive`
 * treats it as consent. `--dry-run` is skipped because it stops the command
 * before the part being measured.
 */
const CONSENT_FLAGS = new Set(["--yes", "--force", "--dry-run"]);

/**
 * The argv that reaches this command's action WITHOUT a confirmation.
 *
 * Deliberately the mirror of `synthesizeArgv` in `json-one-document.scan.ts`:
 * that one passes `--yes` on every run, which is precisely why it can never
 * enter the branch a script takes. Its own header names this as one of the four
 * shadows it cannot reach. This is that shadow, driven.
 *
 * `fillEveryOption` is the SECOND attempt, and it exists for one real shape.
 * `applyBodySatisfiesRequired` un-flips `mandatory` on every field a `--body`
 * could supply and re-imposes the requirement in a `preAction` hook — so on the
 * live tree those options read as optional, a minimal argv omits them, and the
 * hook refuses before the action runs. Four commands do this. Filling
 * everything up front instead would fire mutually exclusive flags together on
 * commands that do not need it, so it is a fallback rather than the rule.
 */
export function argvWithoutConfirmation(
  path: string,
  command: Command,
  sandboxDir: string,
  fillEveryOption = false
): string[] {
  const argv = [...path.split(" ")];

  for (const option of command.options) {
    const long = option.long ?? "";
    if (CONSENT_FLAGS.has(long)) continue;
    if (!option.mandatory && !fillEveryOption) continue;
    if (!option.required && !option.optional) {
      // A boolean flag. Only pass it when it was declared mandatory; sweeping
      // every boolean in would flip behaviour the run is not measuring.
      if (option.mandatory) argv.push(long);
      continue;
    }
    argv.push(long, option.argChoices?.[0] ?? placeholderFor(option.attributeName(), sandboxDir));
  }

  for (const argument of command.registeredArguments) {
    if (!argument.required) continue;
    // 🚨 `argChoices` BEFORE THE PLACEHOLDER. `role detach <type>` declares its
    // positional through `enumArgument`, so `"stub"` is refused by commander
    // above the action and the command is measured as neither asking nor acting
    // — an UNMEASURED run wearing a clean result.
    argv.push(argument.argChoices?.[0] ?? placeholderFor(argument.name(), sandboxDir));
  }

  return argv;
}
