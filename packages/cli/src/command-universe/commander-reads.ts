/**
 * READING COMMANDER THROUGH ITS DECLARED SURFACE — never a private field.
 *
 * Each function here is a fact commander holds that used to be reached by
 * asserting a private shape onto a `Command` or an `Option`. The docblock below
 * is the measurement behind that, and the repo's ESLint config carries a
 * `no-restricted-syntax` rule naming `_hidden` so the cast cannot come back.
 *
 * WHAT BELONGS HERE: a read of commander's own PUBLIC, DECLARED surface, with
 * the private field it replaces named in its docblock. `readOption` is internal
 * to this directory — `build-node.ts` is its only caller and it is not
 * re-exported from `command-universe.ts`, so it is not part of the module's
 * public surface.
 *
 * WHAT DOES NOT: anything that walks or renders. The tree walk is
 * `build-node.ts` and the help capture is `capture-help.ts`, which is
 * deliberately its own file because it is the single funnel every derived
 * capture goes through.
 */

import type { Command, Option } from "commander";

import type { CommandOption } from "./command-node";

/**
 * TWO FACTS COMMANDER HOLDS, READ THROUGH ITS DECLARED SURFACE.
 *
 * Both were reached by asserting a private shape onto a `Command` / `Option`
 * (`as unknown as { _hidden?: boolean }`). An asserted shape is not checked
 * against commander at all, and the failure mode is silence rather than an
 * error: rename the field upstream and the property read yields `undefined`,
 * `undefined === true` is `false`, and every hidden command reports itself
 * VISIBLE. On a module whose entire job is to make the help surface true, a
 * fact that can go wrong without a compiler error is the defect, not the cast.
 *
 * Neither read needs an assertion, so neither has one. Both now go through
 * declarations in commander's own typings, and an upstream change to either is
 * a typecheck failure here.
 */

/**
 * Is this command hidden from every `--help`?
 *
 * `_hidden` is genuinely private and genuinely undeclared. Its PUBLIC
 * equivalent is `Help#visibleCommands`, which is the same filter commander runs
 * to render help — so this asks commander what it would show rather than
 * guessing at how it decides.
 *
 * A command with no parent is never hidden, and that is commander's invariant
 * rather than a convenient default: `_hidden` starts `false` in the constructor
 * and is only ever set by `.command()` / `.addCommand()`, both of which assign
 * `parent` in the same breath. Nothing can be hidden and parentless.
 *
 * ⚠️ THE TREE CURRENTLY REGISTERS NO HIDDEN COMMAND AT ALL, so today this read
 * and the `_hidden` read agree trivially and neither could catch the other being
 * wrong. That is a reason to keep the declared-surface read, not to drop it: the
 * eighteen that used to be here were removed, and the next one added would land
 * on whichever of the two reads this module happens to use.
 */
export const isHiddenCommand = (command: Command): boolean => {
  const parent = command.parent;
  if (parent === null) return false;
  return !parent.createHelp().visibleCommands(parent).includes(command);
};

/**
 * The values `.choices()` declared, or undefined.
 *
 * There is no `choices()` GETTER, which is what the assertion here used to be
 * justified by — but `argChoices` is a declared public field on `Option`, so
 * the getter's absence never made an assertion necessary. Read as declared.
 */
export const optionChoices = (option: Option): readonly string[] | undefined => option.argChoices;

/**
 * One commander `Option` as the {@link CommandOption} a walk carries.
 *
 * The conditional spread OMITS `choices` when the option declares none, rather
 * than setting it to `undefined`. {@link CommandOption.choices} is optional, so
 * an absent key is its declared shape — and `toStrictEqual` in a spec tells an
 * absent key from a present-but-undefined one even where rendering does not.
 *
 * Exported for `build-node.ts`, its only caller, and deliberately not
 * re-exported from `command-universe.ts` — see this file's header.
 */
export function readOption(option: Option): CommandOption {
  const choices = optionChoices(option);
  return {
    flags: option.flags,
    description: option.description,
    ...(choices === undefined ? {} : { choices })
  };
}
