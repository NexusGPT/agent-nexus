/**
 * WHICH OF THE FIVE `--json` SHAPES EACH LEAF PRINTS — DERIVED FROM THE CODE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SIX SHAPES ARE SIX FUNCTIONS, SO THIS IS A DEFINITION AND NOT A GUESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--json` is not uniformly wrapped across this CLI, and the wrapping is not
 * derivable from a command's NAME: `agent list` answers `{data, meta}`,
 * `task list` answers a bare array, `agent create` answers `{success, …}` and
 * `agent get` answers the resource flat. A caller who probes one command's
 * shape has learned nothing about the next, and the failure is SILENT — a `jq`
 * path against the wrong pattern returns `null`, which reads as an empty field
 * rather than as a wrong parse.
 *
 * What makes that mechanical rather than a matter of opinion is that every one
 * of those shapes is produced by exactly ONE function in `output.ts`, and each
 * of those functions has a single `if (_jsonMode)` branch:
 *
 *   printRecord(data, fields)   -> emitDocument(data)          the object, flat
 *   printList(data, meta, cols) -> emitDocument({ data, meta })
 *   printTable(rows, cols)      -> emitDocument(rows)          a bare array
 *   printSuccess(message, data) -> emitDocument({ success: true, message, …data })
 *   printDryRun(message, data)  -> emitDocument({ dryRun: true, message, …data })
 *   printEnvelope(env, render) -> emitDocument(env)           the response itself
 *
 * So "which shape does this leaf print" is the same question as "which of those
 * six does this leaf's action reach", and that question is answered by reading
 * the code rather than by running it. A hand-written table of 508 shapes beside
 * an evolving CLI is the defect this module deletes: it goes stale in complete
 * silence, and a wrong shape in `--help` is worse than none — it is a confident
 * sentence that sends a caller to write the wrong parse.
 *
 * ── WHAT THIS DELIBERATELY REFUSES TO ANSWER ────────────────────────────────
 *
 * 🚨 SILENCE IS A RESULT HERE, AND IT IS THE MOST IMPORTANT ONE. Three cases
 * get NO classification and therefore NO help line:
 *
 *   · a leaf that reaches NONE of the six — around forty commands build their
 *     document with a bare `console.log(JSON.stringify(x))` or hand it to
 *     `emitDocument` through a helper, and the shape is then whatever that
 *     expression evaluates to. Nothing syntactic knows;
 *   · a leaf that reaches MORE THAN ONE — the shape depends on a branch, so any
 *     single sentence about it is false on the other arm;
 *   · a leaf whose registration this scan cannot tie to a command PATH.
 *
 * Reporting those as "unclassified" rather than defaulting one of them is the
 * whole safety property. A default would be a claim, and a claim nobody
 * measured is exactly what this programme exists to remove.
 *
 * ── WHY THE PRINTERS ARE TERMINALS ──────────────────────────────────────────
 *
 * ⚠️ `printList` CALLS `printTable` — on its NON-json branch, to draw the table.
 * A call graph that expands the six reports `printList+printTable` for all 53
 * list commands and classifies none of them, because two shapes look like a
 * branch. So the walk stops AT a printer: reaching one is the answer, never a
 * question to ask again one level down.
 *
 * ── WHY THE PATH IS RESOLVED FROM THE RECEIVER ──────────────────────────────
 *
 * A `.command("get")` literal is not a command path, and `(file, name)` is not
 * a key: many leaves share a name with a sibling in the same file (a namespace
 * can easily carry several `list`s). So the receiver of each `.command()`
 * call is resolved back through local variables and wrapper calls
 * (`confirmable(x)`, `addPaginationOptions(x)`) until it bottoms out at the
 * registrar's own parameter, which yields a path RELATIVE to whatever that
 * parameter is at runtime. That parameter is then resolved through the
 * registrar's call site where one exists (`json-shape.registrar-prefix.ts`),
 * and the caller joins the resulting suffix onto the real command tree, where
 * the absolute path is known.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the scan's DOCUMENT and its public surface; the bodies live in
 * `json-shape/`, one concern per file:
 *
 *   · `printers.ts`            the six terminals, and the one that outranks them;
 *   · `markers.ts`             the self-json markers and the error emitters;
 *   · `self-json.ts`           does this action write its own `--json` document;
 *   · `scanned-leaf.ts`        the classification this scan produces;
 *   · `enumerate.ts`           which files this scan reads;
 *   · `calls.ts`               a call's dotted name, and every call in a body;
 *   · `module-index.ts`        the cross-module index's types and its seen-set;
 *   · `build-index.ts`         declarations and imports, per file;
 *   · `resolve-declaration.ts` which declaration a call written here reaches;
 *   · `reached-printers.ts`    the transitive walk to a terminal;
 *   · `action-body.ts`         finding the body a `.command()` registration runs;
 *   · `scan-json-shapes.ts`    the driver over a tree.
 *
 * 🚨 `action-body.ts` IS A FOURTH COMMANDER-TREE WALKER. Three others were
 * converged behind one helper; this one was not, and moving it here did not
 * converge it either — that is a separate decision from splitting this file,
 * and doing both at once would hide a behaviour change inside a refactor.
 *
 * ⚠️ `enumerate.ts` keeps its OWN `sourceFiles`, which is not
 * `util/scan-program.ts`'s `scanSourceFiles`. They disagree: this one drops
 * `*.generated.ts` and the shared one keeps it. Measured over `src/` at the
 * split: 925 files for the shared enumerator against 873 for
 * `json-error-document`'s, the difference being 51 `*.generated.ts` plus that
 * scan's own source. Both admit `.d.ts`, and `src/` holds none, so the
 * difference nobody can see today is not the one a reader expects.
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. Re-exporting every part's helper because
 * the barrel can reach it would widen this module's public surface under cover
 * of a refactor — which is a behaviour change nothing in a green suite reports.
 * A part that needs a sibling's helper imports it directly.
 */

export { SHAPE_PRINTERS, type ShapePrinter } from "./json-shape/printers";
export { scanJsonShapes } from "./json-shape/scan-json-shapes";
export type { ScannedLeaf } from "./json-shape/scanned-leaf";
