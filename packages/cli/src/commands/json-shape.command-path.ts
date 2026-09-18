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

/** The first `const <name> = …` inside `scope`, or null. */
function declarationIn(name: string, scope: ts.Node): ts.Expression | null {
  let found: ts.Expression | null = null;

  const visit = (node: ts.Node): void => {
    if (
      found === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined
    ) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);

  return found;
}

/**
 * The initializer of the `const` an identifier refers to, or null when it
 * refers to a parameter or to nothing declared in this file.
 *
 * 🚨 SCOPED, NOT FILE-WIDE. A file holding two registrars that each write
 * `const sweep = admin.command(…)` resolved BOTH `sweep.command("trigger")`
 * calls to the first one, so the second registration sat at the first's path.
 * So the enclosing functions are searched innermost-first, a same-named
 * parameter stops the search (it shadows anything further out), and the file as
 * a whole is the last resort.
 */
function initializerOf(identifier: ts.Identifier, source: ts.SourceFile): ts.Expression | null {
  const name = identifier.text;
  for (let scope = identifier.parent; scope !== undefined; scope = scope.parent) {
    if (!ts.isFunctionLike(scope)) continue;
    if (scope.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) return null;
    const found = declarationIn(name, scope);
    if (found !== null) return found;
  }
  return declarationIn(name, source);
}
