import ts from "typescript";

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
export function initializerOf(
  identifier: ts.Identifier,
  source: ts.SourceFile
): ts.Expression | null {
  const name = identifier.text;
  for (let scope = identifier.parent; scope !== undefined; scope = scope.parent) {
    if (!ts.isFunctionLike(scope)) continue;
    if (scope.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) return null;
    const found = declarationIn(name, scope);
    if (found !== null) return found;
  }
  return declarationIn(name, source);
}
