import ts from "typescript";

/** The body of a `.action(fn)` call's handler. */
export function handlerBody(outer: ts.CallExpression): ts.Node | null {
  const handler = outer.arguments[0];
  if (handler === undefined) return null;
  if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) return handler.body;
  return handler;
}

/**
 * The `.action(fn)` this `.command()` registration ends up carrying, or null.
 *
 * 🚨 THREE SHAPES, AND READING ONLY THE FIRST LOSES A QUARTER OF THE TREE.
 * Walking the builder chain upward from `.command()` finds the action for the
 * common form and for nothing else. Measured before these two arms existed: 123
 * of 507 leaves had no action found, including every `confirmable(...)` delete
 * and every paginated list.
 *
 *   1. `parent.command("x").description(…).action(fn)`  — the builder chain.
 *   2. `confirmable(parent.command("x")).option(…).action(fn)` — the
 *      registration is an ARGUMENT to a wrapper, so the chain continues from
 *      the wrapper CALL rather than from the `.command()` node.
 *   3. `const list = addPaginationOptions(x.command("list")…); list.action(fn)`
 *      — the action is a separate statement, so the variable is resolved and
 *      the file searched for `<name>.action(…)`.
 */
export function actionBodyOf(call: ts.CallExpression, source: ts.SourceFile): ts.Node | null {
  let cursor: ts.Node = call;

  for (;;) {
    const parent = cursor.parent;
    if (parent === undefined) return null;

    // (1) builder chain: `<cursor>.method(…)`
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.parent !== undefined &&
      ts.isCallExpression(parent.parent)
    ) {
      const outer = parent.parent;
      if (parent.name.text === "action") return handlerBody(outer);
      cursor = outer;
      continue;
    }

    // (2) wrapper: `wrapper(<cursor>)` — keep climbing from the wrapper's call.
    if (ts.isCallExpression(parent) && parent.arguments.includes(cursor as ts.Expression)) {
      cursor = parent;
      continue;
    }
    if (ts.isParenthesizedExpression(parent)) {
      cursor = parent;
      continue;
    }

    // (3) assigned to a variable: find `<name>.action(…)` anywhere in the file.
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return deferredActionBody(parent.name.text, source);
    }

    return null;
  }
}

/**
 * Is `expression` the variable `name`, or a builder chain on it —
 * `overview.addHelpText(…)` — whose next call would be `.action(…)`?
 */
export function isBuiltFrom(expression: ts.Expression, name: string): boolean {
  let cursor = expression;
  while (
    ts.isCallExpression(cursor) &&
    ts.isPropertyAccessExpression(cursor.expression) &&
    cursor.expression.name.text !== "command"
  ) {
    cursor = cursor.expression.expression;
  }
  return ts.isIdentifier(cursor) && cursor.text === name;
}

/**
 * `<name>.action(fn)` written as its own statement, or null — with or without
 * builder calls between: `overview.addHelpText(…).action(fn)` is the same shape.
 */
export function deferredActionBody(name: string, source: ts.SourceFile): ts.Node | null {
  let found: ts.Node | null = null;

  const visit = (node: ts.Node): void => {
    if (
      found === null &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "action" &&
      isBuiltFrom(node.expression.expression, name)
    ) {
      found = handlerBody(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}
