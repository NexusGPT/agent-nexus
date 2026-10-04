import ts from "typescript";

import { DOCUMENT_EMITTERS } from "./json-error-document.tables";

/** The dotted name of an expression: `console.error`, `refuse`, `a.b.c`. */
export function dottedName(expression: ts.Expression): string {
  const parts: string[] = [];
  let cursor: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(cursor)) {
    parts.unshift(cursor.name.text);
    cursor = cursor.expression;
  }
  if (ts.isIdentifier(cursor)) parts.unshift(cursor.text);
  return parts.join(".");
}

/** `console.log(JSON.stringify(x))` — a document built without a printer. */
export function isBareJsonLog(node: ts.CallExpression): boolean {
  if (dottedName(node.expression) !== "console.log") return false;
  return node.arguments.some(
    (arg) => ts.isCallExpression(arg) && dottedName(arg.expression) === "JSON.stringify"
  );
}

/** Strip `await`, so `= await refuse(...)` reads like `= refuse(...)`. */
export function unwrap(expression: ts.Expression): ts.Expression {
  let cursor = expression;
  while (ts.isAwaitExpression(cursor) || ts.isParenthesizedExpression(cursor)) {
    cursor = cursor.expression;
  }
  return cursor;
}

/** A body that is DEFINED here and RUN somewhere else. */
export function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** The non-zero exit this NODE performs, or null. Never a deep search. */
export function exitCodeOf(node: ts.Node): { code: string; viaEmitter: boolean } | null {
  // process.exit(<n>)
  if (ts.isCallExpression(node) && dottedName(node.expression) === "process.exit") {
    const arg = node.arguments[0];
    const literal = arg !== undefined && ts.isNumericLiteral(arg) ? arg.text : "0";
    return literal === "0" ? null : { code: literal, viaEmitter: false };
  }

  // process.exitCode = <n> | <call>
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    dottedName(node.left) === "process.exitCode"
  ) {
    const right = unwrap(node.right);
    if (ts.isNumericLiteral(right)) {
      return right.text === "0" ? null : { code: right.text, viaEmitter: false };
    }
    // `process.exitCode = handleError(err)` / `= refuse(...)`: the exit code IS
    // the emitter's return value, so the document and the status are the same
    // statement and cannot drift apart at a call site.
    if (ts.isCallExpression(right)) {
      const name = dottedName(right.expression);
      return { code: `${name}(…)`, viaEmitter: DOCUMENT_EMITTERS.has(name) };
    }
    return { code: "<computed>", viaEmitter: false };
  }

  return null;
}
