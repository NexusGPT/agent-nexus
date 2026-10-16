import type { Command } from "commander";

import { carriesDestructiveVerb } from "./destructive-confirmation.verbs";

/** Every node in the tree, keyed by its space-separated path. */
export function everyCommand(
  root: Command,
  trail: readonly string[] = []
): Array<[string, Command]> {
  const out: Array<[string, Command]> = [];
  for (const child of root.commands) {
    if (child.name() === "help") continue;
    const path = [...trail, child.name()];
    out.push([path.join(" "), child]);
    out.push(...everyCommand(child, path));
  }
  return out;
}

/** A node with no children is where an action lives. */
function isLeaf(command: Command): boolean {
  return command.commands.filter((child) => child.name() !== "help").length === 0;
}

/**
 * Every leaf that must be accounted for by name.
 *
 * The union of the two signals, because neither alone is enough: the verb misses
 * `phone-number buy`, and the flag misses every command that never declared one.
 *
 * 🚨 THE POPULATION IS DERIVED FROM THE LIVE COMMANDER TREE, never from a list
 * of files or a path key. Splitting this module across files therefore cannot
 * narrow it — a new leaf joins the population the moment it is registered,
 * whichever file registers it.
 */
export function destructiveCandidates(root: Command): string[] {
  return everyCommand(root)
    .filter(([, command]) => isLeaf(command))
    .filter(
      ([path, command]) =>
        carriesDestructiveVerb(path) || command.options.some((option) => option.long === "--yes")
    )
    .map(([path]) => path)
    .sort();
}
