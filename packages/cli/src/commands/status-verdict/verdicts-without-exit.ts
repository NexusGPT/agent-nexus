import path from "node:path";

import ts from "typescript";

import { createScanProgram, scanSourceFiles } from "../../util/scan-program";
import { coveredVerdictFields } from "./covered-verdicts";
import { emittedVerdictSources } from "./emitted-verdicts";
import { defaultScanRoot, type VerdictWithoutExit } from "./finding";
import { leafOf } from "./leaf-of";
import { CHECK_VERBS } from "./vocabularies";

/**
 * Every check-shaped leaf that emits a verdict with no exit path governed by it.
 *
 * `root` defaults to this package's `src/`; a test hands it a fixture tree, which
 * is how the detector itself is proven rather than assumed.
 *
 * ── WHAT THIS DELIBERATELY CANNOT SEE ───────────────────────────────────────
 *
 * 🚨 SAYING SO IS THE POINT. A gate whose documentation claims completeness is
 * how a whole class reads as closed.
 *
 *   · **a check-shaped verb spelled with a word not in {@link CHECK_VERBS}.**
 *     `nexus agent try` would be invisible. The list is a JUDGEMENT about English,
 *     not a derivation, and it is the half of this scan a reader should attack
 *     first;
 *   · **a verdict on a field name not in {@link VERDICT_FIELDS}**, for the same
 *     reason;
 *   · **a verdict the SERVER sends and the SDK's type does not declare.** The
 *     population is the DECLARED type, so an undeclared field is invisible here
 *     and to every consumer of the SDK alike;
 *   · **a verdict computed inside a helper.** The emission walk resolves an
 *     identifier through its own initializer and no further, so
 *     `renderReport(result)` hides whatever it reads;
 *   · **whether an exit path is CORRECT.** This proves an exit is governed by the
 *     verdict. It cannot prove the mapping is right — that a failing verdict
 *     exits non-zero rather than the other way round. Only a reader can;
 *   · **a verdict nested one level down**, e.g. `result.summary.ok`. This reads
 *     the top level of the emitted type, and one array element type beneath it;
 *   · **a SWALLOWED error** — a `catch` that produces no exit path at all. That
 *     is the same COST (exit 0 over a bad state) reached by a different
 *     mechanism, and it is deliberately not gated here. Measured on this package
 *     on the day this file was written: **13** catch clauses inside a `.action`
 *     produce no exit, and most are correct — `try { JSON.parse(x) } catch {}`
 *     around an optional flag is not a defect. A ledger whose entries are mostly
 *     "this one is fine" is a ledger nobody reads, and then the one real entry
 *     goes past a reviewer. Reproduce the figure before quoting it; it is a
 *     `ts.isCatchClause` walk asking whether the block contains any of
 *     {@link isExitPath}'s forms.
 */
export function scanVerdictsWithoutExit(root = defaultScanRoot()): VerdictWithoutExit[] {
  const fileNames = scanSourceFiles(root);
  const program = createScanProgram(fileNames);
  const checker = program.getTypeChecker();
  const found: VerdictWithoutExit[] = [];

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);
      if (!ts.isCallExpression(node)) return;

      const leaf = leafOf(node, source);
      if (leaf === null) return;
      if (!CHECK_VERBS.has(leaf.command)) return;

      const body = node.arguments[0];
      if (body === undefined) return;

      const sources = emittedVerdictSources(body, source, checker);
      if (sources.size === 0) return;

      const covered = coveredVerdictFields(body, source, sources);

      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const field of [...sources.keys()].sort()) {
        if (covered.has(field)) continue;
        found.push({
          file: path.relative(root, source.fileName).replace(/\\/g, "/"),
          receiver: leaf.receiver,
          command: leaf.command,
          line,
          field
        });
      }
    };

    visit(source);
  }

  return found.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.field.localeCompare(right.field)
  );
}
