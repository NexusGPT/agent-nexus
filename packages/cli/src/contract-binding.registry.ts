import type { Argument, Command, Option } from "commander";

import type { BoundArgument, BoundCommand, BoundOption } from "./contract-binding.types";

/**
 * WHERE A BINDING IS REMEMBERED, AND THE ONLY PLACE IT IS WRITTEN.
 *
 * WeakMaps rather than a registry array: the gate builds a throwaway `Command`
 * tree per namespace, and a module-level array would accumulate across every
 * build in one vitest process and report another namespace's flags as this
 * one's. Keying on the object confines each entry to the tree that made it.
 *
 * The maps are module-private and the `remember*` writers are the whole write
 * surface, so a caller cannot replace an entry wholesale or enumerate the tree
 * — both of which the per-object confinement above exists to prevent.
 */
const BOUND_OPTIONS = new WeakMap<Option, BoundOption>();
const BOUND_ARGUMENTS = new WeakMap<Argument, BoundArgument>();
const BOUND_COMMANDS = new WeakMap<Command, BoundCommand>();

export function boundOption(option: Option): BoundOption | undefined {
  return BOUND_OPTIONS.get(option);
}

export function boundArgument(argument: Argument): BoundArgument | undefined {
  return BOUND_ARGUMENTS.get(argument);
}

export function boundCommand(command: Command): BoundCommand | undefined {
  return BOUND_COMMANDS.get(command);
}

export function rememberOption(option: Option, bound: BoundOption): void {
  BOUND_OPTIONS.set(option, bound);
}

export function rememberArgument(argument: Argument, bound: BoundArgument): void {
  BOUND_ARGUMENTS.set(argument, bound);
}

export function rememberCommand(command: Command, bound: BoundCommand): void {
  BOUND_COMMANDS.set(command, bound);
}
