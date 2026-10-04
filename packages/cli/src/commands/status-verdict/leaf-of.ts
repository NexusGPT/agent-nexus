import ts from "typescript";

/** The leaf command a `.action(...)` belongs to, read off its own call chain. */
export function leafOf(
  action: ts.CallExpression,
  source: ts.SourceFile
): { receiver: string; command: string } | null {
  if (!ts.isPropertyAccessExpression(action.expression)) return null;
  if (action.expression.name.text !== "action") return null;

  let cursor: ts.Expression = action.expression.expression;
  for (;;) {
    if (ts.isCallExpression(cursor) && ts.isPropertyAccessExpression(cursor.expression)) {
      if (
        cursor.expression.name.text === "command" &&
        cursor.arguments.length > 0 &&
        ts.isStringLiteralLike(cursor.arguments[0])
      ) {
        return {
          // The receiver disambiguates two leaves of the same name in one file —
          // `workflow test` and `node test` both live in the workflow tree.
          receiver: cursor.expression.expression.getText(source).replace(/\s+/g, " "),
          command: (cursor.arguments[0] as ts.StringLiteralLike).text
        };
      }
      cursor = cursor.expression.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    return null;
  }
}
