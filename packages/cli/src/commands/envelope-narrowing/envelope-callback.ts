import ts from "typescript";

/**
 * Is this node inside a `printEnvelope(envelope, render)` callback?
 *
 * 🚨 THE CURE MUST NOT READ AS THE DISEASE, AND WITHOUT THIS ARM IT DOES. Inside
 * that callback the document is ALREADY the whole envelope and the callback does
 * not run under `--json` at all, so a table there may take one key, or three, or
 * none — it cannot delete anything from a document it never writes.
 *
 * Left out, the scan reports every command that adopts `printEnvelope`, which
 * makes fixing a narrowing turn the gate red. Measured on the fixture in
 * `envelope-narrowing.test.ts`: the cured form was reported identically to the
 * broken one.
 */
export function insideEnvelopeCallback(node: ts.Node): boolean {
  let child: ts.Node = node;
  let cursor: ts.Node | undefined = node.parent;

  while (cursor !== undefined) {
    if (
      ts.isCallExpression(cursor) &&
      ts.isIdentifier(cursor.expression) &&
      cursor.expression.text === "printEnvelope" &&
      cursor.arguments.includes(child as ts.Expression)
    ) {
      return true;
    }
    child = cursor;
    cursor = cursor.parent;
  }

  return false;
}
