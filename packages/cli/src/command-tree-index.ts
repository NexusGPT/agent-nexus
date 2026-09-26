import type { Command } from "commander";

/**
 * THE ONE WALK THAT TURNS A COMMANDER TREE INTO A PATH INDEX.
 *
 * Depth-first over `command.commands`, keyed by space-joined path, starting at
 * the program's CHILDREN so the root's own name never prefixes a path. `help` is
 * skipped at every level: commander registers it as a real subcommand on every
 * node that has children, so an unfiltered walk reports `agent help`,
 * `agent get help` and hundreds of siblings as commands the CLI documents.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT TAKES THE PROGRAM. IT DOES NOT BUILD ONE, AND THAT IS THE WHOLE DESIGN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This existed as three byte-identical copies — in `cli-surface.project.ts`, in
 * `command-universe.ts`, and in `docs-help-matches-the-real-cli.test.ts`. The
 * third is why the parameter is not a convenience.
 *
 * That spec asserts the generated docs render the help the real binary prints.
 * Its two sides are the DOCS MODEL (`buildDocNamespaces`, which resolves each
 * node's help through `command-universe.ts`'s own index) and the REAL PROGRAM.
 * A spec carrying its own copy of the walker is the fifth form of vacuous
 * assertion — the subject is a replica, and a replica drifts in silence, which
 * is exactly the drift the spec exists to catch.
 *
 * The cure has an equal and opposite trap. Had this function called
 * `buildRootProgram` itself and memoized the result, the spec's "real" side and
 * the docs model's side would resolve to THE SAME `Command` OBJECTS, and the
 * byte-identity arm would collapse to `captureHelp(x) === captureHelp(x)` on
 * every node that resolved — green by construction, comparing the walker with
 * itself. Taking the program as an argument is what forbids that: every caller
 * supplies its own tree, so the spec compares two independently built programs
 * and shares only the ENUMERATION, which is the part that could drift.
 *
 * Converge how the tree is walked. Never converge what is being compared.
 *
 * ── WHERE THIS FILE LIVES ───────────────────────────────────────────────────
 *
 * `src/`, deliberately not `src/commands/`. `discoverRootRegistrars` in
 * `command-universe.ts` `readdirSync`s that directory and imports every `.ts`
 * file in it, so a module dropped there becomes part of the registrar
 * population. The walk is not recursive, so `src/` itself is out of its reach.
 */
export function indexCommandTree(program: Command): ReadonlyMap<string, Command> {
  const index = new Map<string, Command>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    index.set(path.join(" "), command);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };

  for (const root of program.commands) {
    if (root.name() !== "help") visit(root, []);
  }

  return index;
}
