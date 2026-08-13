import type { Command } from "commander";

/**
 * The identity of a CLI route, as one dotted string: `workflow.node.test`.
 *
 * ## It is DERIVED, never registered
 *
 * Nothing declares a route id anywhere. It is read off commander's parent chain
 * at the moment it is needed, so a command added tomorrow has an id with no
 * list to update and no registration to forget. A hand-maintained list of 500
 * ids is a list that is wrong the first time somebody adds a subcommand.
 *
 * ## Why it is stable under an ALIAS, and why that is not luck
 *
 * `nexus skills install` and `nexus skills sync` are `.alias()` spellings of
 * `nexus skills update`. Commander resolves an alias to the SAME `Command`
 * object, and `Command.name()` returns the canonical name rather than the
 * spelling the user typed — so all three invocations derive `skills.update`.
 * Verified by driving real argv through the tree, not by reading the library:
 * `route-id.test.ts` asserts it for every alias the program declares, and the
 * assertion is over the DECLARED aliases rather than a copied list, so a new
 * alias joins the population by itself.
 *
 * The consequence worth stating: an alias cannot fragment a route's known
 * issues across two ids. That is a property of the derivation, not something a
 * maintainer has to remember.
 *
 * ## What it deliberately does NOT do
 *
 * It does not resolve the 18 hidden top-level self-update aliases (`get`,
 * `update`, `pull`, …) to `upgrade`. Those are registered as separate
 * `Command`s rather than as `.alias()` entries, so each derives its own id —
 * `get`, not `upgrade`. That is correct and harmless: they are hidden, nobody
 * curates a known issue against them, and collapsing them would need a list of
 * exactly the kind this function exists to avoid. `nexus get` and
 * `nexus agent get` derive `get` and `agent.get`, which do not collide.
 */
export function routeIdOf(command: Command): string {
  const parts: string[] = [];
  let current: Command | null = command;

  // The root program is the chain's only member with no parent, and its name
  // ("nexus") is not part of a route id — `agent.list`, never `nexus.agent.list`.
  while (current && current.parent) {
    parts.unshift(current.name());
    current = current.parent as Command | null;
  }

  return parts.join(".");
}

/**
 * Every route id the program can produce, in declaration order.
 *
 * Walks the whole tree rather than only its leaves: a namespace can carry its
 * own action (`docs` does), so "leaf" and "runnable" are different questions
 * and taking the wrong one drops a real route silently.
 */
export function allRouteIds(program: Command): string[] {
  const ids: string[] = [];

  const visit = (command: Command): void => {
    if (command.parent) ids.push(routeIdOf(command));
    for (const child of command.commands as Command[]) visit(child);
  };

  visit(program);
  return ids;
}
