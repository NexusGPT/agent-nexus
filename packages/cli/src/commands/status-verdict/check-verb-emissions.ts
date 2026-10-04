import path from "node:path";

import ts from "typescript";

import { createScanProgram, scanSourceFiles } from "../../util/scan-program";
import { defaultScanRoot, verdictKey } from "./finding";
import { leafOf } from "./leaf-of";
import { isVerdictShaped, sinkName, unwrap } from "./verdict-shape";
import { CHECK_VERBS, VERDICT_FIELDS } from "./vocabularies";

/**
 * Every check-shaped leaf this scan LOOKED AT, whatever the verdict.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE ANTI-VACUITY SURFACE, AND IT IS DELIBERATELY NOT THE FINDINGS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The findings DRAIN — that is the whole point of the ledger beside this file —
 * so a control asserting "the scan found something" dies the day the last entry
 * is fixed, and takes the gate with it. A CURED leaf still emits its verdict; it
 * simply also exits over it. So the population below is stable under draining and
 * a zero here means the walk broke, never that the tree got clean.
 */
export function scanCheckVerbEmissions(root = defaultScanRoot()): string[] {
  const fileNames = scanSourceFiles(root);
  const program = createScanProgram(fileNames);
  const checker = program.getTypeChecker();
  const emissions = new Set<string>();

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);
      if (!ts.isCallExpression(node)) return;
      const leaf = leafOf(node, source);
      if (leaf === null || !CHECK_VERBS.has(leaf.command)) return;
      const body = node.arguments[0];
      if (body === undefined) return;

      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && sinkName(n, source) !== null) {
          for (const rawArgument of n.arguments) {
            const argument = unwrap(rawArgument);
            let type = checker.getTypeAtLocation(argument);
            const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
            if (element !== undefined) type = element;
            for (const symbol of type.getProperties()) {
              const name = symbol.getName();
              if (!VERDICT_FIELDS.has(name)) continue;
              if (!isVerdictShaped(checker.getTypeOfSymbolAtLocation(symbol, argument), checker)) {
                continue;
              }
              emissions.add(
                verdictKey({
                  file: path.relative(root, source.fileName).replace(/\\/g, "/"),
                  receiver: leaf.receiver,
                  command: leaf.command,
                  field: name
                })
              );
            }
          }
        }
        ts.forEachChild(n, walk);
      };
      walk(body);
    };

    visit(source);
  }

  return [...emissions].sort();
}
