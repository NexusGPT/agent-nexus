/**
 * JOIN THE SCAN ONTO THE REAL COMMAND TREE — one projection, two readers.
 *
 * `scripts/generate-json-shape.ts` writes the result; `json-shape.codegen.test.ts`
 * recomputes it and fails on any difference. Both call `projectJsonShapes`, so
 * the generator and its gate cannot answer differently — two walks of one tree
 * disagreeing is the defect `command-universe.ts` already documents next door.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the DOCUMENT and the public surface; the bodies live in
 * `json-shape-project/`, one concern per file:
 *
 *   · `projection.ts`    the printer-to-shape table and the result types;
 *   · `best-match.ts`    which leaf a scanned registration belongs to, and why
 *                        the join is on the path suffix rather than the module;
 *   · `project.ts`       the scan root and the join driver;
 *   · `render-module.ts` the generated module's text.
 *
 * 🚨 ITS OWN FOLDER, NOT `json-shape/`. That directory holds the parts of
 * `json-shape.scan.ts`, and its header is the index of them; dropping a second
 * barrel's parts in there would make that index wrong about files it does not
 * own. The two are separate concerns that share a stem — the scan reads source,
 * this projection joins the scan's answer onto the real tree.
 *
 * ⚠️ NO `json-shape-*` ESLINT GLOB. The dashed family form would also sweep
 * `json-shape-command-path/`, `json-shape.scan.ts` and both ledgers' siblings;
 * each folder is armed by its own exact path. `git ls-files
 * 'packages/cli/src/commands/json-shape*'` is the check and its LIST is the
 * answer.
 *
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. `SHAPE_OF` and `bestMatch` became exports
 * of their own parts so a sibling can read them, and neither is re-exported
 * here: widening this module's public surface under cover of a refactor is a
 * behaviour change nothing in a green suite reports.
 */

export { defaultSourceRoot, projectJsonShapes } from "./json-shape-project/project";
export type { Projection, UnclassifiedReason } from "./json-shape-project/projection";
export { renderJsonShapeModule } from "./json-shape-project/render-module";
