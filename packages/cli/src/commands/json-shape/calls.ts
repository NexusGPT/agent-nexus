import ts from "typescript";

/** The dotted name of an expression: `printRecord`, `client.agents.get`. */
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

/**
 * Every call name inside a body, INCLUDING the bodies of callbacks it creates.
 *
 * A callback IS run by whatever it is handed to, so a printer inside one is a
 * printer this function reaches. Excluding them would drop every command that
 * prints from inside a `runFollow` handler.
 */
export function callsIn(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) names.add(dottedName(node.expression));
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}
