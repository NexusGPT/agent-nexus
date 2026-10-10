/**
 * PROJECTIONS OF THE ONE WALK — nodes, namespaces, leaves, and the hidden
 * siblings that could not be attributed.
 *
 * Every function here reshapes `deriveCommandModules()` and none of them
 * walks the tree again. That is the whole reason they share a file: a docs
 * generator and a classification gate reading two different walks of one tree is
 * how the two answers start disagreeing, and keeping the projections together
 * makes a second walk a visible addition rather than a quiet one.
 *
 * WHAT BELONGS HERE: a pure reshaping of the module walk — a filter, a sort, a
 * de-duplication, a field-by-field copy. The union docblock below is the
 * argument for what the population is and what it still cannot reach.
 *
 * WHAT DOES NOT: a second call to `discoverRootRegistrars` or a second
 * `buildNode`. If a consumer needs a fact no projection here carries, the fact
 * belongs on `CommandNode` or in that consumer's own richer type — not in a new
 * walk.
 */

import { flattenCommands } from "./build-node";
import type { CommandNamespace, CommandNode } from "./command-node";
import { deriveCommandModules } from "./derive-modules";

/**
 * THE AUTHORITATIVE TREE — the per-module walks, unioned.
 *
 * ⚠️ THE POPULATION IS NOT BUILT FROM `src/index.ts`, and the reason is
 * attribution rather than safety: only a registrar run against its own program
 * can say WHICH module produced a namespace and which hidden siblings sit beside
 * it. A shared program answers what exists and never who registered it. (The old
 * reason — that importing `index.ts` would parse `process.argv` — has stopped
 * being true: its side effect sits behind an entry-point guard, which is what
 * makes `root-program.ts` importable at all.)
 *
 * 🔴 THIS DOCBLOCK USED TO CERTIFY THE UNION "VERIFIED EQUAL TO A SINGLE SHARED
 * PROGRAM: 500 LEAVES EITHER WAY, EMPTY DIFF IN BOTH DIRECTIONS". That
 * measurement was true and it compared command PATHS — the one axis that never
 * diverged. Content was never compared, and it differed on 565 of 565 nodes:
 * `index.ts` decorates the
 * finished tree with the known-issues pointer and the help-scope footer, and no
 * throwaway program carries either. A certification that names its axis is worth
 * something; one that reads as "verified equal" stops the next reader looking.
 *
 * So the union still supplies the POPULATION and the attribution, and
 * {@link CommandNode.help} is captured from the real root program instead —
 * see {@link indexRootProgram}. `docs-help-matches-the-real-cli.test.ts` asserts
 * the two are byte-identical on every documented path, which is the check this
 * docblock only claimed to have run.
 *
 * 🚨 WHAT THE UNION STILL CANNOT REACH: the PROGRAM-LEVEL options. `--json`,
 * `--profile`, `--timeout` and `--dashboard-url` are applied to the root object
 * itself, so no namespace registrar can see them and neither does any node here
 * — the index above deliberately keys the root's CHILDREN, not the root. That is
 * a real gap with a real cost: a command-level `.option()` colliding with a
 * global never receives its value, because the root parses its own options
 * across the whole of argv first.
 */

/** Every node in the CLI, depth-first, sorted by path, de-duplicated. */
export async function deriveCommandNodes(): Promise<CommandNode[]> {
  const seen = new Map<string, CommandNode>();
  for (const module of await deriveCommandModules()) {
    for (const root of module.roots) {
      for (const node of flattenCommands(root)) {
        if (!seen.has(node.path)) seen.set(node.path, node);
      }
    }
  }
  return [...seen.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** The visible top-level namespaces, each carrying its attributed hidden siblings. */
export async function deriveCommandNamespaces(): Promise<CommandNamespace[]> {
  const namespaces: CommandNamespace[] = [];

  for (const module of await deriveCommandModules()) {
    const visible = module.roots.filter((root) => !root.hidden);
    const siblings = module.roots.filter((root) => root.hidden).map((root) => root.name);

    for (const root of visible) {
      // Field by field, never `{ ...root }`. Object spread READS every enumerable
      // property, so spreading would evaluate the `help` getter and capture help
      // for every namespace — making the laziness above a lie for exactly the
      // callers that never wanted the text.
      namespaces.push({
        path: root.path,
        name: root.name,
        description: root.description,
        aliases: root.aliases,
        hidden: root.hidden,
        options: root.options,
        children: root.children,
        isLeaf: root.isLeaf,
        sourceModule: root.sourceModule,
        helpSource: root.helpSource,
        get help(): string {
          return root.help;
        },
        hiddenSiblings: visible.length === 1 ? siblings : [],
        sourcePath: module.sourcePath,
        registrar: module.registrar
      });
    }
  }

  return namespaces.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Modules whose hidden siblings could not be attributed, because the module
 * registers more than one visible namespace. Reported, never guessed.
 */
export async function unattributedHiddenSiblings(): Promise<string[]> {
  const orphans: string[] = [];

  for (const module of await deriveCommandModules()) {
    const visible = module.roots.filter((root) => !root.hidden);
    const hidden = module.roots.filter((root) => root.hidden);
    if (hidden.length > 0 && visible.length !== 1) {
      orphans.push(`${module.sourceModule}: ${hidden.length} hidden, ${visible.length} visible`);
    }
  }

  return orphans;
}

/**
 * Every leaf path the CLI registers, sorted, de-duplicated.
 *
 * A PROJECTION of {@link deriveCommandNodes}, not a second walk. The
 * classification gate wants paths and nothing else; a docs generator wants the
 * metadata this throws away. Two walks over one tree is how the two answers
 * start disagreeing.
 */
export async function deriveCommandLeaves(): Promise<string[]> {
  return (await deriveCommandNodes()).filter((node) => node.isLeaf).map((node) => node.path);
}
