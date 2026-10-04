import ts from "typescript";

import { closure, derivationEdges, identifiersIn } from "./derivation";
import { governingConditions, isExitPath } from "./exit-path";

/**
 * Which of the emitted verdicts govern an exit path.
 *
 * A field is covered when some exit path in `body` is governed by a condition
 * reading a name reachable from that field's seeds through local initializers.
 * The closure is what keeps the CURED `auth status` out of the findings — its
 * exit reads `refusal`, which is computed from `probe`, which the emitted
 * `verified` is computed from too, and nothing in that `if` names `verified`.
 */
export function coveredVerdictFields(
  body: ts.Node,
  source: ts.SourceFile,
  sources: ReadonlyMap<string, Set<string>>
): Set<string> {
  const edges = derivationEdges(body);
  const covered = new Set<string>();

  const collectExits = (n: ts.Node): void => {
    if (isExitPath(n, source)) {
      const conditions = governingConditions(n, body);
      if (conditions.length > 0) {
        const read = new Set<string>();
        for (const condition of conditions) {
          for (const name of identifiersIn(condition)) read.add(name);
        }
        for (const [field, seeds] of sources) {
          const reachable = closure(seeds, edges);
          for (const name of read) {
            if (reachable.has(name)) covered.add(field);
          }
        }
      }
    }
    ts.forEachChild(n, collectExits);
  };
  collectExits(body);

  return covered;
}
