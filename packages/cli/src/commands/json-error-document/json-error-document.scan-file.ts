import ts from "typescript";

import { exitCodeOf, isFunctionLike } from "./json-error-document.ast";
import {
  documentFollows,
  foldSequentialCalls,
  type PathState
} from "./json-error-document.document-follows";
import type { ProseRefusal } from "./json-error-document.report";

/** Walk one file's control flow, reporting every prose-then-exit pairing. */
export function scanFile(
  fileName: string,
  source: ts.SourceFile,
  proseHelpers: ReadonlySet<string>,
  report: { exitSites: number; exitsThroughEmitter: number; violations: ProseRefusal[] }
): void {
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  /** The one child of a branch that ALWAYS evaluates. Its arms do not. */
  const conditionOf = (node: ts.Node): ts.Node | undefined => {
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return node.expression;
    if (ts.isConditionalExpression(node)) return node.condition;
    if (ts.isTryStatement(node)) return undefined;
    return undefined;
  };

  const isBranch = (node: ts.Node): boolean =>
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isTryStatement(node);

  const walk = (node: ts.Node, inherited: PathState): void => {
    // A function body starts a fresh path: nothing the ENCLOSING scope printed
    // has run at the time the body is DEFINED.
    const state: PathState = isFunctionLike(node)
      ? { prose: undefined, document: false }
      : { ...inherited };

    // 🚨 THE ARMS OF A BRANCH ARE NOT A SEQUENCE. Folding the THEN arm's
    // `printRecord` into the state the ELSE arm inherits marks the defect
    // compliant — and that pair IS `external-tool test-auth`, one of the two
    // findings this gate was built from.
    const branch = isBranch(node);
    const condition = branch ? conditionOf(node) : undefined;

    ts.forEachChild(node, (child) => {
      const exit = exitCodeOf(child);
      if (exit !== null) {
        report.exitSites += 1;
        if (exit.viaEmitter) {
          report.exitsThroughEmitter += 1;
        } else if (!state.document && state.prose !== undefined && !documentFollows(node)) {
          report.violations.push({
            where: `${fileName}:${lineOf(child)}`,
            detail:
              `exits ${exit.code} after \`${state.prose}(…)\` wrote prose to stderr, ` +
              `with no JSON document on stdout`
          });
        }
      }

      walk(child, state);
      if (!branch || child === condition) {
        foldSequentialCalls(child, state, proseHelpers);
      }
    });
  };

  walk(source, { prose: undefined, document: false });
}
