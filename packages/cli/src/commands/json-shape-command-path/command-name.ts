import ts from "typescript";

/** Strip `await` and parentheses, so `await confirmable(x)` reads as `confirmable(x)`. */
export function unwrap(expression: ts.Expression): ts.Expression {
  let cursor = expression;
  while (ts.isAwaitExpression(cursor) || ts.isParenthesizedExpression(cursor)) {
    cursor = cursor.expression;
  }
  return cursor;
}

/** Is this call `<something>.command("<literal>")`? */
export function commandName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "command") return null;

  const first = node.arguments[0];
  if (first === undefined || !ts.isStringLiteralLike(first)) return null;

  // `.command("node get <id>")` — commander takes the name up to the first
  // space, and the rest declares arguments.
  return first.text.split(/\s+/)[0] ?? null;
}
