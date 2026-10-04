import ts from "typescript";

import { identifiersIn } from "./derivation";
import { isVerdictShaped, sinkName, unwrap } from "./verdict-shape";
import { VERDICT_FIELDS } from "./vocabularies";

/**
 * What verdict does this leaf emit, and what is each one computed FROM?
 *
 * The keys are the verdict fields some sink in `body` is handed. The values are
 * the SEED identifiers that field is derived from, which
 * {@link coveredVerdictFields} closes over local initializers before asking
 * whether any exit path is governed by one.
 *
 * ⚠️ `check-verb-emissions.ts` walks the same sinks with the same four filters
 * and keeps the KEY instead of the seeds. The two traversals are identical up to
 * that last step and are deliberately NOT merged here — converging two scanners
 * is a behaviour change wearing a refactor's clothes, and this split is a pure
 * move. The duplication is a finding, recorded rather than fixed.
 */
export function emittedVerdictSources(
  body: ts.Node,
  source: ts.SourceFile,
  checker: ts.TypeChecker
): Map<string, Set<string>> {
  const sources = new Map<string, Set<string>>();

  const collectEmissions = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && sinkName(n, source) !== null) {
      for (const rawArgument of n.arguments) {
        const argument = unwrap(rawArgument);
        let type = checker.getTypeAtLocation(argument);
        // A table is handed the ROWS; the verdict is on the row.
        const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
        if (element !== undefined) type = element;

        for (const symbol of type.getProperties()) {
          const name = symbol.getName();
          if (!VERDICT_FIELDS.has(name)) continue;
          const propertyType = checker.getTypeOfSymbolAtLocation(symbol, argument);
          if (!isVerdictShaped(propertyType, checker)) continue;

          // What is this verdict computed FROM? For a literal built at the
          // call site, the property's own initializer; otherwise the payload
          // expression itself. `channel setup` is the first case
          // (`{ ready: data.ready }`), `external-tool test` the second.
          const declaration = symbol.valueDeclaration;
          const seeds =
            declaration !== undefined &&
            ts.isPropertyAssignment(declaration) &&
            declaration.getSourceFile() === source
              ? identifiersIn(declaration.initializer)
              : identifiersIn(argument);

          const existing = sources.get(name) ?? new Set<string>();
          for (const seed of seeds) existing.add(seed);
          // The field name itself is a seed: `switch (result.status)` reads it
          // by name, and a shorthand `{ status }` carries no other identifier.
          existing.add(name);
          sources.set(name, existing);
        }
      }
    }
    ts.forEachChild(n, collectEmissions);
  };
  collectEmissions(body);

  return sources;
}
