import ts from "typescript";

import { unwrap } from "./expressions";
import { humanOnly } from "./json-mode";

/**
 * Every key of `name` this body reads somewhere a `--json` caller can still see.
 *
 * Handing the object WHOLE to a printer counts as reading all of it — that is
 * what `printEnvelope(result, …)` does, and it is the cure this scan exists to
 * push people towards, so it must not be reported as the disease.
 */
export function keysReachingTheDocument(body: ts.Node, name: string): Set<string> | "all" {
  const read = new Set<string>();
  let whole = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !humanOnly(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (callee !== null && callee.startsWith("print")) {
        for (const argument of node.arguments) {
          const bare = unwrap(argument);
          if (ts.isIdentifier(bare) && bare.text === name) whole = true;
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name &&
      !humanOnly(node)
    ) {
      read.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(body);

  return whole ? "all" : read;
}
