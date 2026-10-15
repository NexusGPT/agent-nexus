import ts from "typescript";

/** The function body this node sits in — the unit a response variable lives in. */
export function enclosingBody(node: ts.Node): ts.Node {
  let cursor: ts.Node | undefined = node;
  while (cursor !== undefined) {
    if (
      ts.isArrowFunction(cursor) ||
      ts.isFunctionExpression(cursor) ||
      ts.isFunctionDeclaration(cursor) ||
      ts.isMethodDeclaration(cursor)
    ) {
      return cursor.body ?? cursor;
    }
    cursor = cursor.parent;
  }
  return node;
}

/**
 * Peel the wrappers a narrowing is written behind.
 *
 * `result.folders ?? result` takes the LEFT: the `??` is dead where the type is
 * non-nullable, and where it is not, the left is still the intended payload.
 * `Array.isArray(x) ? x : [x]` takes the true arm for the same reason.
 */
export function unwrap(expression: ts.Expression): ts.Expression {
  let cursor = expression;
  for (;;) {
    if (ts.isParenthesizedExpression(cursor) || ts.isAwaitExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    if (ts.isAsExpression(cursor) || ts.isNonNullExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    if (
      ts.isBinaryExpression(cursor) &&
      cursor.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      cursor = cursor.left;
      continue;
    }
    if (ts.isConditionalExpression(cursor)) {
      cursor = cursor.whenTrue;
      continue;
    }
    return cursor;
  }
}

/** The property access a printer argument ultimately reads, through one alias. */
export function resolveAccess(
  argument: ts.Expression,
  checker: ts.TypeChecker,
  depth = 0
): ts.PropertyAccessExpression | null {
  if (depth > 6) return null;

  const expression = unwrap(argument);
  if (ts.isPropertyAccessExpression(expression)) return expression;

  if (ts.isIdentifier(expression)) {
    const declaration = checker.getSymbolAtLocation(expression)?.declarations?.[0];
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined
    ) {
      return resolveAccess(declaration.initializer, checker, depth + 1);
    }
  }

  return null;
}
