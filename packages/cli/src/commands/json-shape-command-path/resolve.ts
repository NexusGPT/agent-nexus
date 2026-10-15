import ts from "typescript";

import { commandName, unwrap } from "./command-name";
import { initializerOf } from "./initializer";

/** A command path, and the identifier it is relative TO. */
export interface ResolvedCommandPath {
  /** The `.command()` names from the base down, e.g. `["node", "get"]`. */
  readonly segments: readonly string[];
  /**
   * The identifier the walk bottomed out at — one with no `const` initializer in
   * scope, which in a registrar is its own `Command` parameter.
   */
  readonly base: string;
}

/**
 * Peel chained builder calls and wrappers back to whatever produced the object,
 * or `null` for a wrapper called with no argument.
 *
 *   · `parent.command("x").description(…).option(…)` -> `parent.command("x")`
 *   · `confirmable(x)`, `addPaginationOptions(x)` — a wrapper returning its own
 *     argument. Descend into the first argument; a wrapper that returned
 *     something else would resolve to a path that does not exist in the tree,
 *     which the caller reports rather than trusts.
 */
function peel(expression: ts.Expression): ts.Expression | null {
  let cursor = unwrap(expression);
  for (;;) {
    if (
      ts.isCallExpression(cursor) &&
      ts.isPropertyAccessExpression(cursor.expression) &&
      cursor.expression.name.text !== "command"
    ) {
      cursor = unwrap(cursor.expression.expression);
      continue;
    }
    if (ts.isCallExpression(cursor) && ts.isIdentifier(cursor.expression)) {
      const inner = cursor.arguments[0];
      if (inner === undefined) return null;
      cursor = unwrap(inner);
      continue;
    }
    return cursor;
  }
}

/**
 * The command path an expression evaluates to, relative to the identifier it
 * bottoms out at, or `null` when the expression cannot be resolved.
 *
 * Resolution walks three shapes and refuses everything else:
 *   · `parent.command("x")`               — the receiver is another `.command()`
 *   · `someVariable.command("x")`         — resolved through its initializer
 *   · `wrapper(parent.command("x")).opt()` — descends into the wrapper's argument
 *
 * An initializer is followed once per hop and must itself be a `.command()`
 * chain: `const a = b` resolves to nothing, rather than to whatever `b` is.
 */
export function resolveCommandPath(
  start: ts.Expression,
  source: ts.SourceFile
): ResolvedCommandPath | null {
  const segments: string[] = [];
  const guard = new Set<ts.Node>();
  let cursor = peel(start);
  let viaInitializer = false;

  while (cursor !== null) {
    if (guard.has(cursor)) return null;
    guard.add(cursor);

    const name = commandName(cursor);
    if (name !== null) {
      segments.unshift(name);
      // The receiver: the expression `.command` was read off.
      const receiver = ((cursor as ts.CallExpression).expression as ts.PropertyAccessExpression)
        .expression;
      cursor = peel(receiver);
      viaInitializer = false;
      continue;
    }

    if (ts.isIdentifier(cursor) && !viaInitializer) {
      const initializer = initializerOf(cursor, source);
      // No initializer means the identifier is the registrar's own parameter —
      // the bottom of the chain, and the point the path is relative TO.
      if (initializer === null) return { segments, base: cursor.text };
      cursor = peel(initializer);
      viaInitializer = true;
      continue;
    }

    return null;
  }

  return null;
}
