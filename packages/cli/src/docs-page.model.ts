/**
 * The docs model — a {@link CommandNamespace} from the ONE walk, enriched with
 * the v1 contract facts that walk deliberately does not carry.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS NO LONGER DOES, AND WHY THAT MATTERS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This module used to walk the commander tree itself, because
 * `deriveCommandLeaves()` returned `string[]` and threw away aliases,
 * hiddenness, options, help and the source module — every fact a docs page needs.
 * `command-universe` now returns NODES, so that walk is deleted and there is one
 * walk of this tree in the repository. `captureHelp`, `isHidden` and `choicesOf`
 * went with it; `isHiddenCommand` and `optionChoices` replace them, and both
 * read commander's DECLARED surface rather than asserting a private shape onto
 * it — so a commander change breaks the typecheck instead of silently reporting
 * every hidden command visible and every option choiceless.
 *
 * 🚨 NEVER SPREAD A `CommandNode`. Its `help` is a LAZY MEMOIZED GETTER —
 * capturing it for all ~582 nodes costs the classification gate 31ms for text it
 * never reads. `{ ...node }` EVALUATES the getter, so a spread silently converts
 * the laziness into an eager capture and the cost comes back. Build field by
 * field. This module reads `help` exactly once per node it renders, which is the
 * point at which the cost is genuinely owed.
 *
 * ── 🔴 THE ONE THING THIS STILL WALKS FOR, AND THE SHAPE THAT WOULD END IT ───
 *
 * `boundOption()` / `boundCommand()` resolve through WeakMaps keyed on the LIVE
 * `Command` and `Option` objects. A `CommandNode` is a plain object and holds no
 * reference to either, so a contract divergence is unreachable from the node —
 * and the divergence is the whole of this renderer's RED rule.
 *
 * So {@link divergencesByPath} runs the registrars once more and collects ONLY a
 * `path -> divergence` map. It builds no tree, no model and no second opinion
 * about what commands exist; the population still comes from
 * `deriveCommandNamespaces()`.
 *
 * It disappears the moment `CommandNode` can answer the question — either a
 * `contractDivergences?: readonly {flags, contractValues, offered, omit,
 * alsoAccepts, because}[]` field populated where `boundOption` resolves, or a
 * non-enumerable reference to the `Command` itself. Either ends this pass.
 */

import type { Command } from "commander";

import {
  type CommandNamespace,
  type CommandNode,
  type CommandOption,
  deriveCommandNamespaces,
  discoverRootRegistrars,
  flattenCommands,
  unattributedHiddenSiblings
} from "./command-universe";
import { boundOption } from "./contract-binding";

export { unattributedHiddenSiblings };

/**
 * A declared disagreement between the contract and what the CLI offers.
 *
 * 🚨 BOTH SIDES ARE CARRIED, ALWAYS. This type has no field for "the answer".
 * Where the two sources disagree the page goes RED and names both; it never
 * resolves the disagreement, because resolving it is how the wrong one becomes
 * authoritative. `DeploymentTypeSchema` lists `SMS`, the server 500s on `SMS`,
 * and the CLI omits it on purpose — a page printing only the contract's list
 * republishes a broken value, and a page printing only the CLI's list hides that
 * every SDK and MCP consumer is still being told it works.
 */
export interface DocDivergence {
  readonly flags: string;
  readonly contractValues: readonly string[];
  readonly offered: readonly string[];
  readonly omitted: readonly string[];
  readonly alsoAccepts: readonly string[];
  readonly because: string;
}

export interface DocCommand {
  readonly path: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly hidden: boolean;
  readonly help: string;
  readonly options: readonly CommandOption[];
  readonly divergences: readonly DocDivergence[];
}

export interface DocNamespace {
  readonly name: string;
  readonly description: string;
  readonly help: string;
  readonly aliases: readonly string[];
  readonly hiddenSiblings: readonly string[];
  readonly commands: readonly DocCommand[];
  readonly sourceRefs: readonly string[];
}

/**
 * `path -> divergences`, collected by running each registrar once.
 *
 * See this module's header: this exists ONLY because the WeakMaps are keyed on
 * live `Command`/`Option` objects that a `CommandNode` does not carry. It is not
 * a population source — nothing here decides which commands exist.
 */
async function divergencesByPath(): Promise<Map<string, DocDivergence[]>> {
  const { Command: CommandCtor } = await import("commander");
  const found = new Map<string, DocDivergence[]>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    const here: DocDivergence[] = [];

    for (const option of command.options) {
      const bound = boundOption(option);
      if (bound?.divergence === undefined) continue;
      here.push({
        flags: option.flags,
        contractValues: bound.source.contractValues,
        offered: bound.offered,
        omitted: bound.divergence.omit ?? [],
        alsoAccepts: bound.divergence.alsoAccepts ?? [],
        because: bound.divergence.because
      });
    }

    if (here.length > 0) found.set(path.join(" "), here);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };

  for (const registrar of await discoverRootRegistrars()) {
    const program = new CommandCtor();
    program.name("nexus").exitOverride();
    registrar.register(program);
    for (const root of program.commands) {
      if (root.name() !== "help") visit(root, []);
    }
  }

  return found;
}

/** Field by field — NEVER a spread. See the header on the lazy `help` getter. */
function toDocCommand(node: CommandNode, divergences: Map<string, DocDivergence[]>): DocCommand {
  return {
    path: node.path,
    description: node.description,
    aliases: node.aliases,
    hidden: node.hidden,
    help: node.help,
    options: node.options,
    divergences: divergences.get(node.path) ?? []
  };
}

function toDocNamespace(
  namespace: CommandNamespace,
  divergences: Map<string, DocDivergence[]>
): DocNamespace {
  return {
    name: namespace.name,
    description: namespace.description,
    help: namespace.help,
    aliases: namespace.aliases,
    hiddenSiblings: namespace.hiddenSiblings,
    // `flattenCommands` yields the namespace itself first; a docs page documents
    // its subcommands under their own headings and the namespace in its own
    // block, so the head is dropped here rather than special-cased downstream.
    commands: flattenCommands(namespace)
      .slice(1)
      .map((node) => toDocCommand(node, divergences)),
    sourceRefs: [namespace.sourcePath]
  };
}

export async function buildDocNamespaces(): Promise<DocNamespace[]> {
  const [namespaces, divergences] = await Promise.all([
    deriveCommandNamespaces(),
    divergencesByPath()
  ]);

  return namespaces
    .map((namespace) => toDocNamespace(namespace, divergences))
    .sort((a, b) => a.name.localeCompare(b.name));
}
