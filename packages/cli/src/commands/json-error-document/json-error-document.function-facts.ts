import ts from "typescript";

import { dottedName, isBareJsonLog, isFunctionLike } from "./json-error-document.ast";
import { DOCUMENT_EMITTERS, STDERR_PROSE } from "./json-error-document.tables";

export interface FunctionFacts {
  /** Writes prose to stderr, itself or through something it calls. */
  prose: boolean;
  /** Emits a JSON document, itself or through something it calls. */
  document: boolean;
  /** Every name it calls, for the fixed point below. */
  readonly calls: Set<string>;
}

/** Collect one function's own calls, ignoring the bodies nested inside it. */
function ownCalls(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node !== body && isFunctionLike(node)) {
      // A callback's body IS run by whatever it is handed to, so its calls
      // count as this function's — a progress callback writing to stderr is
      // exactly how `runDeploymentWatch` writes prose.
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isCallExpression(node)) {
      names.add(dottedName(node.expression));
      if (isBareJsonLog(node)) names.add("emitDocument");
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}

/** Every named function in a file, with the calls it makes. */
export function functionFacts(source: ts.SourceFile): Map<string, FunctionFacts> {
  const facts = new Map<string, FunctionFacts>();

  const visit = (node: ts.Node): void => {
    let name: string | undefined;
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      name = node.name.text;
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      body = node.initializer.body;
    }

    if (name !== undefined && body !== undefined) {
      const calls = ownCalls(body);
      facts.set(name, {
        prose: [...calls].some((call) => STDERR_PROSE.has(call)),
        document: [...calls].some((call) => DOCUMENT_EMITTERS.has(call)),
        calls
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return facts;
}
