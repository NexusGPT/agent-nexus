import ts from "typescript";

/** Is this call `isJsonMode()`, however it was imported? */
export function isJsonModeCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression)) return node.expression.text === "isJsonMode";
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "isJsonMode";
  }
  return false;
}

/**
 * Does this node only run when `--json` is OFF?
 *
 * True when some enclosing `if (!isJsonMode())` has the node in its THEN branch,
 * or some enclosing `if (isJsonMode())` has it in the ELSE. Both spellings are
 * in the tree and they mean the same thing.
 */
export function humanOnly(node: ts.Node): boolean {
  let child: ts.Node = node;
  let cursor: ts.Node | undefined = node.parent;

  while (cursor !== undefined) {
    if (ts.isIfStatement(cursor)) {
      const condition = cursor.expression;
      const negated =
        ts.isPrefixUnaryExpression(condition) &&
        condition.operator === ts.SyntaxKind.ExclamationToken &&
        isJsonModeCall(condition.operand);

      if (negated && cursor.thenStatement === child) return true;
      if (isJsonModeCall(condition) && cursor.elseStatement === child) return true;
    }
    child = cursor;
    cursor = cursor.parent;
  }

  return false;
}
