import ts from "typescript";

/**
 * Is this type BRANCHABLE — something a caller can act on?
 *
 * A boolean is. A string is, literal union or not. An array is: an empty
 * `errors` is the pass and a non-empty one is the fail.
 *
 * A number and an object are NOT. That rules out a `status` that is an HTTP code
 * and an `outcome` that is a nested report — neither is a value a shell can
 * branch on without first knowing a second thing.
 *
 * ⚠️ THIS TEST IS DELIBERATELY NOT "IS IT A CLOSED UNION". The first version
 * demanded a string-LITERAL union, on the reasoning that a bare `string` is a
 * label rather than an answer. It dropped FOUR real findings —
 * `execution diagnose`, `workflow test-node`, `workflow node test` and
 * `workspace status` — because the SDK declares those fields as plain `string`,
 * and because an object literal built at the call site widens `"yes" | "no"` to
 * `string` before any scan can read it. The narrowing that keeps `agent get` out
 * of this population is {@link CHECK_VERBS}, which is a fact about the VERB. It
 * does not need a second, weaker copy of itself here.
 */
export function isVerdictShaped(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = type.isUnion() ? type.types : [type];
  let sawAnswer = false;

  for (const part of parts) {
    // `undefined` and `null` are how an optional verdict is spelled. They neither
    // qualify a type nor disqualify it.
    if (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
    if (part.flags & ts.TypeFlags.BooleanLike) {
      sawAnswer = true;
      continue;
    }
    if (part.flags & ts.TypeFlags.StringLike) {
      sawAnswer = true;
      continue;
    }
    // An array of problems: `errors: string[]`, `issues: Issue[]`.
    if (checker.isArrayType(part) || checker.isTupleType(part)) {
      sawAnswer = true;
      continue;
    }
    return false;
  }

  return sawAnswer;
}

/** Peel the wrappers a payload is written behind, so its real type is reachable. */
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
    // `JSON.stringify(x, null, 2)` — the document is `x`. `workspace status` and
    // `execution diagnose` both emit their `--json` document this way, below
    // every printer in this package.
    if (
      ts.isCallExpression(cursor) &&
      cursor.expression.getText() === "JSON.stringify" &&
      cursor.arguments.length > 0
    ) {
      cursor = cursor.arguments[0];
      continue;
    }
    return cursor;
  }
}

/** Is this call a place bytes leave the process? */
export function sinkName(call: ts.CallExpression, source: ts.SourceFile): string | null {
  if (ts.isIdentifier(call.expression)) {
    // Every printer in `output.ts` is `print*`, and a command-local renderer
    // follows the same convention — `printVibeCluster` is one, and keying on the
    // exact export list would have missed it.
    const name = call.expression.text;
    if (name.startsWith("print") || name === "emitDocument") return name;
    return null;
  }
  if (ts.isPropertyAccessExpression(call.expression)) {
    const text = call.expression.getText(source).replace(/\s+/g, "");
    if (text === "console.log" || text === "process.stdout.write") return text;
  }
  return null;
}
