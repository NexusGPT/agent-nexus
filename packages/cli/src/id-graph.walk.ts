import type { Command } from "commander";

import { COMMAND_CLASSIFICATION } from "./command-universe";
import { boundCommand } from "./contract-binding";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * READING THE COMMANDER TREE — one walk, and the only place this package's id
 * graph touches commander at all.
 *
 * Separate from `id-graph.ts` because it answers a different question. This file
 * says WHAT THE TREE CONTAINS; `id-graph.ts` decides what may be done with it.
 * Keeping them apart means the derivation can be reasoned about — and tested —
 * against a fixed set of rows without a commander program in the picture.
 */

/**
 * One leaf, flattened. Every field is read off live commander objects; nothing
 * here is parsed out of rendered text or grepped from source.
 */
export interface RawLeaf {
  readonly path: string;
  /** From {@link COMMAND_CLASSIFICATION}, or `(unclassified)` — never defaulted to a disposition. */
  readonly disposition: string;
  /** Required positionals in declaration order, which is argv order. */
  readonly requiredParams: readonly string[];
  /**
   * Commander `.requiredOption()` flags this leaf declares.
   *
   * The harness supplies positionals and `--json` and nothing else, so ANY entry
   * here is an input it cannot satisfy. Reading them is the same move as reading
   * `registeredArguments`: commander already knows, and asking it is the only way
   * that does not go stale.
   */
  readonly mandatoryOptions: readonly string[];
  /** From the Public API v1 contract binding. Absent when the leaf has none. */
  readonly method?: string;
  readonly route?: string;
}

/**
 * Every leaf of the REAL root program.
 *
 * ⚠️ IT WALKS `buildRootProgram()` RATHER THAN THE PER-REGISTRAR UNION THAT
 * `deriveCommandModules()` USES, and the difference is load-bearing.
 * {@link boundCommand} is a `WeakMap` keyed on the live `Command` OBJECT, so a
 * node built by a throwaway registrar program is a DIFFERENT object and reads as
 * unbound — every leaf would look unbindable and the population would be empty.
 * Walking the real tree is the only way to read a binding at all.
 *
 * The union is still the right source for `command-universe.ts`, which needs to
 * attribute each namespace to the module that registered it. The two walks
 * answer different questions and neither is a substitute for the other.
 */
export function walkLeaves(): RawLeaf[] {
  const out: RawLeaf[] = [];
  const classification = COMMAND_CLASSIFICATION as Readonly<Record<string, string>>;

  const visit = (command: Command, prefix: readonly string[]): void => {
    const children = command.commands.filter((child) => child.name() !== "help");
    if (children.length > 0) {
      for (const child of children) visit(child, [...prefix, child.name()]);
      return;
    }

    const path = prefix.join(" ");
    // `registeredArguments` is PUBLIC commander API — `readonly Argument[]` on
    // `Command` since v12, and this package is on ^13. It was written here as a
    // double cast through `unknown` first, which `request-body-boundary.test.ts`
    // correctly refused: the cast was not reaching past a missing type, it was
    // reaching past a type that was already there.
    const registered = command.registeredArguments;
    const bound = boundCommand(command);
    // `mandatory` is commander's own flag for `.requiredOption()`. `required` on
    // an Option means its ARGUMENT is required (`--x <v>` vs `--x [v]`), which is
    // a different question and not the one being asked here.
    const mandatory = command.options
      .filter((option) => option.mandatory)
      .map((option) => option.flags);

    out.push({
      path,
      disposition: classification[path] ?? "(unclassified)",
      requiredParams: registered
        .filter((argument) => argument.required)
        .map((argument) => argument.name()),
      mandatoryOptions: mandatory,
      method: bound?.shape.method,
      route: bound?.shape.route
    });
  };

  for (const root of buildRootProgram(VERSION).commands) {
    if (root.name() !== "help") visit(root, [root.name()]);
  }
  return out;
}
