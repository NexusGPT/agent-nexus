// ---------------------------------------------------------------------------
// The one spelling of a command's full path.
// ---------------------------------------------------------------------------

import type { Command } from "commander";

/**
 * The full command line a command is reached by, e.g. `nexus agent list`.
 *
 * Walked from the command's own parent chain rather than passed in, so a caller
 * that only holds the leaf can still name it. One definition, because a document
 * keyed by a path somebody rebuilt differently is two vocabularies with one name.
 */
export function commandPath(command: Command): string {
  const names: string[] = [];
  let node: Command | null = command;
  while (node) {
    names.unshift(node.name());
    node = node.parent;
  }
  return names.join(" ");
}
