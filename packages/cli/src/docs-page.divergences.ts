import { indexCommandTree } from "./command-tree-index";
import { discoverRootRegistrars } from "./command-universe";
import { boundOption } from "./contract-binding";
import type { DocDivergence } from "./docs-page.model.types";

/**
 * THE ONE THING THE DOCS MODEL STILL WALKS FOR.
 *
 * `boundOption()` resolves through WeakMaps keyed on the LIVE `Command` and
 * `Option` objects. A `CommandNode` is a plain object and holds no reference to
 * either, so a contract divergence is unreachable from the node — and the
 * divergence is the whole of the renderer's RED rule.
 *
 * `docs-page.model.ts`'s header carries the shape that would end this pass.
 */

/**
 * `path -> divergences`, collected by running each registrar once.
 *
 * See the header above: this exists ONLY because the WeakMaps are keyed on
 * live `Command`/`Option` objects that a `CommandNode` does not carry. It is not
 * a population source — nothing here decides which commands exist.
 */
export async function divergencesByPath(): Promise<Map<string, DocDivergence[]>> {
  const { Command: CommandCtor } = await import("commander");
  const found = new Map<string, DocDivergence[]>();

  for (const registrar of await discoverRootRegistrars()) {
    const program = new CommandCtor();
    program.name("nexus").exitOverride();
    registrar.register(program);

    for (const [path, command] of indexCommandTree(program)) {
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

      if (here.length > 0) found.set(path, here);
    }
  }

  return found;
}
