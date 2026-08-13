import type { Command } from "commander";

import { routeIdOf } from "./util/route-id";

/**
 * THE POINTER TO `nexus known-issues`, ON EVERY COMMAND'S `--help`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `--help` MUST NOT TOUCH THE NETWORK, AND THIS IS WHY THE LINE IS STATIC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` is what a stuck user types. It has to answer instantly, offline, in
 * CI, behind a proxy, and inside a pipe. So this prints a fixed sentence naming
 * the command to run; the live data lives behind that command and is fetched
 * only when somebody asks for it.
 *
 * The same argument is already settled next door in `help-scope.ts`, from the
 * other direction: its staleness line reads a cache SYNCHRONOUSLY because
 * commander's help action calls `process.exit()` before any promise settles. A
 * fetch here would not be slow, it would simply never arrive.
 *
 * ── WHY A TREE WALK, AND NOT ONE `afterAll` ON THE ROOT ──────────────────────
 *
 * `registerHelpScopeFooter` puts ONE registration on the root and reaches every
 * command, because commander fires `afterAll` on the helped command and all its
 * ancestors. That works for a sentence that is the same everywhere. This one is
 * not: it names THIS command's route id, so it needs a per-command string.
 *
 * `"after"` fires only on the command it is registered on, which is exactly the
 * per-command position — and it lands ABOVE the scope footer rather than
 * competing with it for the last slot, so the global caveat stays last where
 * `help-scope.ts` says it belongs.
 *
 * The walk is the whole population. There is no list of participating commands,
 * so a namespace added tomorrow carries the line without being registered
 * anywhere — the same property that makes the route id derived rather than
 * declared. A hand-maintained population is the defect wearing a fix's clothes.
 *
 * ── THE ROOT IS SKIPPED, AND IT IS NOT A STYLE CHOICE ────────────────────────
 *
 * `routeIdOf(program)` is `""` — the root's own name is not part of a route id.
 * A line built from it would read `nexus known-issues ` with nothing after it,
 * and the server refuses an empty route with a 400. So the root would carry an
 * instruction that cannot work. `nexus --help` is a namespace index rather than
 * a command anyone is stuck on, which is the same reason stated positively.
 *
 * ── AND SO IS `known-issues` ITSELF ──────────────────────────────────────────
 *
 * Its own id is valid and the call would work; it would just tell a reader to
 * run `nexus known-issues known-issues`, which reads as a mistake on the one
 * screen that has to be trusted. This is an identity test against the command
 * object, not a name in a list — nothing has to be kept in step with it.
 */

/** The line, for one command. Exported so the gate asserts one string, not a copy of it. */
export function knownIssuesHelpLine(routeId: string): string {
  return `\nKnown issues on this route: run \`nexus known-issues ${routeId}\``;
}

/**
 * The stable half of the sentence.
 *
 * Exported for the same reason `HELP_SCOPE_HEADING` is: a gate asserting against
 * a second copy typed into a test lets the line be reworded into uselessness
 * with the gate still green.
 */
export const KNOWN_ISSUES_HELP_PREFIX = "Known issues on this route:";

/**
 * Install the line on every command in the tree.
 *
 * Call LAST in `buildRootProgram`, after every registrar, or the commands
 * registered afterwards are not in the tree this walks.
 */
export function applyKnownIssuesHelpLine(program: Command): void {
  // Resolved once, by identity. A name comparison inside the walk would also
  // match a subcommand called `known-issues` under some other namespace.
  const reporter = (program.commands as Command[]).find((c) => c.name() === "known-issues");

  const visit = (command: Command): void => {
    // The root has no route id, and the reporter does not report on itself.
    if (command.parent && command !== reporter) {
      command.addHelpText("after", knownIssuesHelpLine(routeIdOf(command)));
    }

    for (const child of command.commands as Command[]) visit(child);
  };

  visit(program);
}
