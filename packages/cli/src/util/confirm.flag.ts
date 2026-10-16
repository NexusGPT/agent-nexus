import { Command } from "commander";

/** Declaring `--yes`, and the structural record that it was declared here. */

/** The description every `--yes` flag carries, in these exact words. */
export const YES_FLAG_DESCRIPTION =
  "Confirm without prompting. Required in a script: with no terminal this refuses instead of proceeding.";

/**
 * Commands whose confirmation is known to go through this path.
 *
 * A WeakMap keyed on the `Command`, the same shape `contract-binding.ts` uses
 * and for the same reason: the gate builds throwaway trees, and a module-level
 * array would carry one tree's registrations into the next.
 *
 * This is what makes the gate structural rather than a source scan. Which
 * function a closure calls is not visible on the `Command` object, so a test
 * could only grep for it — and a grep cannot tell a hand-rolled prompt that
 * happens to look right from one that is right. Registration is a fact ON the
 * object, and the only way to get it is to call {@link confirmable}.
 */
const CONFIRMABLE = new WeakSet<Command>();

/** True when this command's `--yes` was declared through {@link confirmable}. */
export function isConfirmable(command: Command): boolean {
  return CONFIRMABLE.has(command);
}

/**
 * Declare `--yes` on a destructive command. Use this instead of writing
 * `.option("--yes", ...)` by hand, so the description cannot drift and the gate
 * can see that the command has a confirmation at all.
 */
export function confirmable(command: Command): Command {
  command.option("--yes", YES_FLAG_DESCRIPTION);
  CONFIRMABLE.add(command);
  return command;
}
