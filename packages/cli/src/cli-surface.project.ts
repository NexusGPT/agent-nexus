/**
 * PROJECT THE WHOLE PUBLIC SURFACE OF `nexus` — one function, two readers.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The CLI registers hundreds of invocable leaves and nothing put them in one
 * place. So the question a reviewer most needs answered — *did this pull request
 * change the public surface?* — had no artefact to answer it. A removed flag, a renamed
 * subcommand, a new required positional and a leaf turning hidden all landed as
 * a diff in a registration file that reads like any other edit.
 *
 * `cli-surface.generated.ts` is that artefact. `scripts/generate-cli-surface.ts`
 * writes it; `cli-surface.codegen.test.ts` recomputes it and fails on any
 * difference. Both call THIS projection, so the writer and its gate cannot
 * answer differently — the defect `command-universe.ts` documents next door.
 *
 * The gate is not the value. THE DIFF IS. A pull request that changes the
 * surface goes red until its author regenerates, and the regenerated diff is
 * then a line-per-leaf statement of exactly what the surface gained or lost.
 *
 * ── THE TWO WALKS, AND WHY THERE ARE TWO ────────────────────────────────────
 *
 * `deriveCommandNodes()` is the POPULATION and the ATTRIBUTION: it unions the
 * per-registrar walks, which is the only way to learn WHICH module produced a
 * namespace. What a `CommandNode` cannot carry is the structural detail this
 * manifest is about — positionals, option mandatoriness, option hiddenness,
 * `.choices()` on either — because none of that is on the node type.
 *
 * So the live `Command` objects of the REAL root program supply the detail, and
 * the join is by path. `docs-help-matches-the-real-cli.test.ts` walks the root
 * program the same way and for the same reason; this is the house pattern, not
 * a shortcut around `command-universe.ts`.
 *
 * ⚠️ TWO WALKS OF ONE TREE IS EXACTLY HOW TWO ANSWERS START DISAGREEING, which
 * is why `Projection.unjoined` is a FIELD rather than an assumption. A
 * leaf the root program does not carry is REPORTED, never dropped and never
 * guessed at, and the spec asserts the two sets are equal in both directions.
 * That assertion lives in `cli-surface.codegen.test.ts` and it runs on every
 * change, which is a stronger statement than any reading quoted here: a count
 * written in this docblock said "586 nodes, 586 root-program paths" against a
 * live 642 and 642, and being stale cost it nothing because nothing read it.
 * The equality is the invariant; the cardinality is `cli-surface.generated.ts`'s
 * header, which is regenerated.
 *
 * ── WHAT IS DERIVED, AND WHAT COULD NOT BE ──────────────────────────────────
 *
 * Every field on every row is read off commander. Two joins reach outside it,
 * and both are onto artefacts that are themselves derived:
 *
 *   - `disposition` joins `COMMAND_CLASSIFICATION`, which is DECLARED. Intent
 *     is not derivable — only a human knows `agent delete` must never run in a
 *     sweep. A leaf that declaration does not name is rendered `"(unclassified)"`
 *     rather than defaulted to a plausible word; `command-universe.test.ts` is
 *     what REFUSES that state, and this manifest only has to report it.
 *   - `json` joins `JSON_SHAPES`, itself generated and gated next door. Its
 *     abstentions arrive here as `"(abstains)"` rather than as an absent key,
 *     because an absent key and an unclassified command look identical in a
 *     diff and only one of them is news.
 *
 * Nothing here greps source. The package ships a 9 MB prose bundle in
 * `skills-content.generated.json`, and a `grep` over `src/` for a flag name
 * counts the prose — which has already produced two false census readings in
 * this package.
 *
 * ── WHERE EACH HALF LIVES ───────────────────────────────────────────────────
 *
 * This module is the PUBLIC NAME for the projection and declares nothing. The
 * halves are `cli-surface.encode.ts` (the per-field encoders and the tier rule),
 * `cli-surface.projection.model.ts` (the shape a projection carries),
 * `cli-surface.walk.ts` (the two walks and their join) and
 * `cli-surface.module-text.ts` with `cli-surface.module-header.ts` (the
 * generated module's text). None of them imports this file back, so the
 * re-export stays acyclic.
 */

export { encodeArgument, encodeOption, shapeOf, tierOf } from "./cli-surface.encode";
export { renderCliSurfaceModule, renderLeaf } from "./cli-surface.module-text";
export type { Projection } from "./cli-surface.projection.model";
export { projectCliSurface, realRootProgram } from "./cli-surface.walk";
