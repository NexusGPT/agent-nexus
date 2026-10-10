/**
 * THE ONE WALK — a commander `Command` tree into `CommandNode`s.
 *
 * Depth-first over `command.commands`, never over rendered text. It also
 * owns the memoized index of the REAL root program, because the STRUCTURAL
 * facts and the rendered HELP come from two different programs and this is the
 * only place that pairing is decided.
 *
 * WHAT BELONGS HERE: the walk, the root-program index it threads, and
 * `flattenCommands`. The two docblocks below are the argument for why the help
 * text cannot be captured from the program a registrar ran against; they are
 * the most expensive fact in this directory and they belong next to the code
 * that acts on them.
 *
 * WHAT DOES NOT: projections of the result. `derive-modules.ts` runs this per
 * registrar and `derive-projections.ts` reshapes what comes back — a second
 * walk in either is how the two answers start disagreeing.
 */

import type { Command } from "commander";

import { indexCommandTree } from "../command-tree-index";
import { captureHelp } from "./capture-help";
import type { CommandNode } from "./command-node";
import { isHiddenCommand, readOption } from "./commander-reads";

/**
 * Every command the REAL root program registers, keyed by its space-joined path.
 *
 * ⚠️ THIS IS A HELP SOURCE, NEVER A POPULATION SOURCE. The tree is still the
 * union of the per-registrar walks, because only those can attribute a namespace
 * to the module that produced it. This map answers one question: for a path that
 * tree already found, WHICH live `Command` object does the shipped binary parse
 * with — so `--help` can be captured from that one instead of from a throwaway.
 *
 * 🚨 IT CAPTURES NO HELP. Building the index is {@link indexCommandTree} and
 * nothing else, so it stays off the classification gate's bill; the capture
 * happens inside {@link CommandNode.help}'s getter, on the node that is asked.
 *
 * The walk itself is shared with `cli-surface.project.ts` and with
 * `docs-help-matches-the-real-cli.test.ts`. It takes a program rather than
 * building one precisely so that spec keeps its own — see that module's header.
 *
 * The import is DYNAMIC to route around a real cycle — `index.ts` imports the
 * registrars, the registrars reach this module, and this module now needs
 * `index.ts` back. `root-program.ts` is the sanctioned door and `index.ts`'s
 * side effect sits behind an entry-point guard, so importing it builds the tree
 * without running the CLI.
 *
 * Memoized: the tree is deterministic within a process, and four exported
 * functions each rebuild the module walks.
 */
let rootProgramIndex: Promise<ReadonlyMap<string, Command>> | undefined;

async function indexRootProgram(): Promise<ReadonlyMap<string, Command>> {
  const { buildRootProgram, VERSION } = await import("../root-program");
  return indexCommandTree(buildRootProgram(VERSION));
}

/**
 * The memoized index, reached through a function.
 *
 * 🚨 THIS IS THE ONE PLACE THE SPLIT CHANGED CODE RATHER THAN MOVING IT, and the
 * reason is a hard ESM property rather than taste. `rootProgramIndex` is a
 * module-level `let` that `deriveCommandModules` used to assign to directly,
 * which is only expressible while the two sit in ONE file: an imported binding
 * is read-only, so `rootProgramIndex ??= indexRootProgram()` written in
 * `derive-modules.ts` does not compile.
 *
 * The semantics are unchanged and that is the whole claim: the index is built at
 * most once per process, on the first call, and every later caller awaits the
 * same promise. The memo now lives in the module that owns the state, which is
 * where module-private mutable state has to live for it to be private at all.
 */
export function rootProgramHelpIndex(): Promise<ReadonlyMap<string, Command>> {
  rootProgramIndex ??= indexRootProgram();
  return rootProgramIndex;
}

/**
 * THE ONE WALK. Every derivation in this directory is a projection of it —
 * `derive-modules.ts` runs it per registrar and `derive-projections.ts` reshapes
 * that result. Neither walks the tree a second time.
 *
 * Depth-first over `command.commands`, never over rendered text: a rendering
 * omits hidden commands by construction, and it collapses a command's `.alias()`
 * spellings into the same row as its name.
 *
 * The walked `command` supplies every STRUCTURAL fact — path, options, children,
 * hiddenness. `rootProgram` supplies the rendered HELP, because that text is
 * decorated after every registrar has run. See {@link CommandNode.help}.
 */
export function buildNode(
  command: Command,
  prefix: readonly string[],
  sourceModule: string,
  rootProgram: ReadonlyMap<string, Command>
): CommandNode {
  const path = [...prefix, command.name()];
  const children = command.commands
    .filter((child) => child.name() !== "help")
    .map((child) => buildNode(child, path, sourceModule, rootProgram));

  const live = rootProgram.get(path.join(" "));
  let cachedHelp: string | undefined;
  return {
    path: path.join(" "),
    name: command.name(),
    description: command.description(),
    aliases: command.aliases(),
    hidden: isHiddenCommand(command),
    options: command.options.map(readOption),
    children,
    isLeaf: children.length === 0,
    sourceModule,
    helpSource: live === undefined ? "registrar-fallback" : "root-program",
    get help(): string {
      cachedHelp ??= captureHelp(live ?? command);
      return cachedHelp;
    }
  };
}

/** A node and every descendant, depth-first, the node itself first. */
export function flattenCommands(node: CommandNode): CommandNode[] {
  return [node, ...node.children.flatMap(flattenCommands)];
}
