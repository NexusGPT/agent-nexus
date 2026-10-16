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
 * `command-universe` now returns NODES, so that walk is deleted. What remains of
 * an enumeration here — `divergencesByPath`, which needs the live `Option`
 * objects a `CommandNode` does not carry — goes through `indexCommandTree`, so
 * this module holds no copy of the walk's rules. `captureHelp`, `isHidden` and `choicesOf`
 * went with it; `isHiddenCommand` and `optionChoices` replace them, and both
 * read commander's DECLARED surface rather than asserting a private shape onto
 * it — so a commander change breaks the typecheck instead of silently reporting
 * every hidden command visible and every option choiceless.
 *
 * 🚨 NEVER SPREAD A `CommandNode`. Its `help` is a LAZY MEMOIZED GETTER —
 * capturing it for every node in the tree costs the classification gate real
 * time for text it never reads. Neither the node count nor the millisecond
 * figure is quoted here any more: both moved (the count read ~582 against a
 * live 642) and nothing checked either, while the PROPERTY that makes the cost
 * avoidable is asserted directly in `command-universe.test.ts`.
 * `{ ...node }` EVALUATES the getter, so a spread silently converts
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
 * So `divergencesByPath()` — in `docs-page.divergences.ts` — runs the registrars
 * once more and collects ONLY a `path -> divergence` map. It builds no tree, no
 * model and no second opinion about what commands exist; the population still
 * comes from `deriveCommandNamespaces()`.
 *
 * It disappears the moment `CommandNode` can answer the question — either a
 * `contractDivergences?: readonly {flags, contractValues, offered, omit,
 * alsoAccepts, because}[]` field populated where `boundOption` resolves, or a
 * non-enumerable reference to the `Command` itself. Either ends this pass.
 *
 * The row types are `docs-page.model.types.ts`; neither sibling imports this
 * file back, so the re-export stays acyclic.
 */

import {
  type CommandNamespace,
  type CommandNode,
  deriveCommandNamespaces,
  flattenCommands,
  unattributedHiddenSiblings
} from "./command-universe";
import { divergencesByPath } from "./docs-page.divergences";
import type { DocCommand, DocDivergence, DocNamespace } from "./docs-page.model.types";

export { unattributedHiddenSiblings };
export type { DocCommand, DocDivergence, DocNamespace } from "./docs-page.model.types";

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
