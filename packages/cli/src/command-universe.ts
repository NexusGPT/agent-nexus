/**
 * THE COMMAND UNIVERSE — every leaf `nexus` can run, derived from the tree.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/sweep.sh` executes a set of read-only leaves against a live API and
 * fails CI when one of them regresses. A sweep is only ever evidence about the
 * commands it KNOWS ABOUT, so the load-bearing question is never "did the safe
 * leaves pass" but "are those still all of them". No count is written down in
 * this file, deliberately: a figure in prose beside a table that moves is the
 * same stale list this module exists to delete, one layer up. Run
 * `tsx scripts/command-universe.ts --check-drift` and read the number it
 * derives.
 *
 * That question has exactly one honest source: the commander program tree. A
 * hand-written list of command paths beside an evolving CLI is the defect this
 * module deletes — it goes stale in complete silence, and a sweep over a stale
 * list reads identically to a sweep over a complete one.
 *
 * So the POPULATION is derived and the CLASSIFICATION is declared:
 *
 *   - `deriveCommandModules()` walks the real tree, ONCE. A new command is in
 *     the population the moment it is registered. Nobody has to remember
 *     anything. `deriveCommandNodes()`, `deriveCommandNamespaces()` and
 *     `deriveCommandLeaves()` are projections of that one walk, never second
 *     walks — a docs generator and a classification gate reading two different
 *     walks of one tree is how the two answers start disagreeing.
 *   - {@link COMMAND_CLASSIFICATION} says what may be DONE with each leaf.
 *     Intent cannot be derived — only a human knows that `agent delete` must
 *     never run in a sweep — so it is declared, once, in
 *     `command-universe/command-classification.ts`.
 *   - `classifyCommandUniverse()` diffs the two. An unclassified leaf is a
 *     failure, not a default, so a new command CANNOT be added silently.
 *
 * ── WHY NOT PARSE `--help` ───────────────────────────────────────────────────
 *
 * The previous detector shelled out to `nexus <path> --help` for every node and
 * scraped the rendered text with awk. That reads a RENDERING of the tree rather
 * than the tree: it needs a built `dist/`, spawns one process per node, and any
 * epilogue line that happens to be indented two spaces and start lowercase is
 * indistinguishable from a subcommand. This module reads `command.commands`.
 *
 * 🚨 THE RENDERING OMITS HIDDEN COMMANDS BY CONSTRUCTION, and it also omits the
 * `.alias()` spellings a command answers to. `upgrade.ts` once registered
 * eighteen `{ hidden: true }` top-level commands that all reinstalled the
 * running binary, and a scraper could not see one of them. The tree can. That is
 * not a bug in the awk; it is the reason a rendering can never be the source.
 *
 * ── WHAT A NODE CARRIES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────
 *
 * {@link CommandNode} carries everything derivable from commander ALONE: path,
 * description, aliases, hiddenness, options with their `.choices()`, children,
 * and the rendered help. It carries no v1-contract binding, and that omission is
 * a seam rather than a gap — a consumer that binds commands to the public API
 * contract maps a node into its own richer type and adds that field there. This
 * module is the gate `Tests: Vitest` runs; it must not be able to go red because
 * a contract projection somewhere else broke.
 */

/**
 * ── WHERE EACH CONCERN LIVES ─────────────────────────────────────────────────
 *
 * This file is the ENTRY POINT and holds no logic, no table and no type of its
 * own. Every name below is re-exported from `./command-universe/`, so every
 * module and spec that imports from here keeps its spelling — and the ESLint
 * `no-restricted-syntax` rule that tells a reader to use `isHiddenCommand`
 * "from src/command-universe.ts" goes on naming a path that exports it.
 *
 *   disposition.ts            what may be DONE with a leaf — the union
 *   command-classification.ts the declared table, one line per leaf
 *   sweep-expected-skips.ts   what one ENVIRONMENT currently answers
 *   drift-report.ts           the shape `classify.ts` returns
 *   command-node.ts           what one walk of the tree returns
 *   commander-reads.ts        commander's facts, read as DECLARED
 *   capture-help.ts           the one funnel every help capture goes through
 *   registrar-discovery.ts    finding the root registrars on disk
 *   build-node.ts             THE ONE WALK, and the root-program help index
 *   derive-modules.ts         the walk run per registrar — the attribution source
 *   derive-projections.ts     nodes, namespaces, leaves — reshapings of that walk
 *   classify.ts               the derived tree diffed against the declarations
 *
 * ⚠️ THE RE-EXPORTS ARE NAMED ONE BY ONE AND NOT `export *`, SO THIS LIST IS THE
 * PUBLIC SURFACE. A star would make every helper added inside the directory
 * public the moment it was written — `readOption` is the live example: it is
 * exported from `commander-reads.ts` because `build-node.ts` needs it, and it is
 * deliberately absent from here. A new public name costs a line in this file,
 * which is the review this file exists to buy.
 *
 * 🚨 ADDING CODE HERE IS THE REGRESSION. This file was 1,723 lines because a
 * table, a contract and a tree walk are three reasons to open one file, and it
 * absorbed each "small addition" without anyone deciding. A concern that does
 * not fit one of the modules above is a NEW module above, never a paragraph
 * here.
 */

export { flattenCommands } from "./command-universe/build-node";
export { captureHelp } from "./command-universe/capture-help";
export { classifyCommandUniverse, staleDeclarations } from "./command-universe/classify";
export { COMMAND_CLASSIFICATION } from "./command-universe/command-classification";
export type {
  CommandModule,
  CommandNamespace,
  CommandNode,
  CommandOption
} from "./command-universe/command-node";
export { isHiddenCommand, optionChoices } from "./command-universe/commander-reads";
export { deriveCommandModules } from "./command-universe/derive-modules";
export {
  deriveCommandLeaves,
  deriveCommandNamespaces,
  deriveCommandNodes,
  unattributedHiddenSiblings
} from "./command-universe/derive-projections";
export type { CommandDisposition } from "./command-universe/disposition";
export type { DriftReport } from "./command-universe/drift-report";
export type { DiscoveredRegistrar } from "./command-universe/registrar-discovery";
export { discoverRootRegistrars } from "./command-universe/registrar-discovery";
export { SWEEP_EXPECTED_SKIPS } from "./command-universe/sweep-expected-skips";

/**
 * The routes this branch introduces that the deployed API cannot serve yet.
 *
 * RE-EXPORTED, and the module is `./sweep-routes-pending-deploy`. It moved out
 * because `scripts/id-thread-sweep.ts` needs this declaration and nothing else
 * here, and the spec that drives that runner spawns it 84 times — so every spawn
 * was parsing the whole of `COMMAND_CLASSIFICATION` to read one small table.
 *
 * The re-export is the half that keeps the move honest: the three sweep
 * declarations are read by one derivation and one bash face, so a reader who
 * comes looking where the other two live must still find this one.
 */
export {
  SWEEP_ROUTES_PENDING_DEPLOY,
  type SweepPendingDeployRoute
} from "./sweep-routes-pending-deploy";
