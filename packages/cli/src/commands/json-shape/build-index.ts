import path from "node:path";

import ts from "typescript";

import { callsIn } from "./calls";
import type { ModuleIndex, SourceIndex } from "./module-index";

/** Every named function in a file, with the calls it makes and its body. */
export function indexDeclarations(source: ts.SourceFile, into: ModuleIndex): void {
  const visit = (node: ts.Node): void => {
    let name: string | undefined;
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      name = node.name.text;
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      body = node.initializer.body;
    }

    if (name !== undefined && body !== undefined) {
      // Union WITHIN one file only — an overload pair, or a name declared in two
      // branches of the same module. That union is bounded by the file, so it
      // cannot reach a body the caller has no way of calling.
      const existing = into.calls.get(name) ?? new Set<string>();
      for (const call of callsIn(body)) existing.add(call);
      into.calls.set(name, existing);
      into.bodies.set(name, [...(into.bodies.get(name) ?? []), body]);
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
}

/**
 * A relative specifier resolved onto a file this scan actually indexed.
 *
 * Bare specifiers (`node:fs`, `commander`, `typescript`) resolve to nothing on
 * purpose: they are outside the tree, so no walk can continue through them.
 */
export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  known: ReadonlySet<string>
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/** The bindings a file imported, so a call can be followed to its real module. */
export function indexImports(
  source: ts.SourceFile,
  file: string,
  known: ReadonlySet<string>,
  into: ModuleIndex
): void {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const target = resolveSpecifier(file, statement.moduleSpecifier.text, known);
    if (target === null) continue;

    const clause = statement.importClause;
    if (clause === undefined) continue;

    // 🚨 A DEFAULT IMPORT IS DELIBERATELY NOT BOUND, AND THE BINDING THAT USED
    // TO SIT HERE COULD NEVER HAVE FIRED. `indexDeclarations` records a function
    // under its own identifier, and no function can be named `default`, so a
    // binding stored under that name is looked up and missed on every walk —
    // coverage in appearance, a dropped edge in fact.
    //
    // Dropping it is the CORRECT behaviour and not merely the honest one: an
    // unresolved call ends the walk everywhere else in this module, and a leaf
    // that reaches no printer is reported unclassified rather than guessed.
    // Measured on this package: ZERO `export default` in the files the scan
    // reads, against 181 files carrying some `export`. Should one appear, it
    // costs a classification — never a wrong one.

    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;

    if (ts.isNamespaceImport(bindings)) {
      into.namespaces.set(bindings.name.text, target);
      continue;
    }

    for (const element of bindings.elements) {
      // `import { a as b }` is declared `a` over there and called `b` here.
      into.imports.set(element.name.text, {
        file: target,
        name: element.propertyName?.text ?? element.name.text
      });
    }
  }
}

/** Index every parsed file: its declarations, and where its imported names live. */
export function buildIndex(
  parsed: readonly { file: string; source: ts.SourceFile }[]
): SourceIndex {
  const known = new Set(parsed.map((entry) => entry.file));
  const index = new Map<string, ModuleIndex>();

  for (const { file, source } of parsed) {
    const module: ModuleIndex = {
      calls: new Map(),
      bodies: new Map(),
      imports: new Map(),
      namespaces: new Map()
    };
    indexDeclarations(source, module);
    indexImports(source, file, known, module);
    index.set(file, module);
  }

  return index;
}
