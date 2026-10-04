import ts from "typescript";

/** Every identifier name appearing anywhere in an expression. */
export function identifiersIn(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) names.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(node);
  return names;
}

/**
 * `name -> the identifiers its initializer reads`, for every local in a body.
 *
 * This is the whole of the dataflow this scan does, and it is deliberately shallow:
 * it makes "the exit is governed by something computed from the verdict" decidable
 * without a solver, and its limit is written down above.
 */
export function derivationEdges(body: ts.Node): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  const walk = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined) {
      edges.set(n.name.text, identifiersIn(n.initializer));
    }
    ts.forEachChild(n, walk);
  };
  walk(body);
  return edges;
}

/** Every name reachable from `seeds` by following initializers. */
export function closure(seeds: Iterable<string>, edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>(seeds);
  const queue = [...seen];
  while (queue.length > 0) {
    const next = queue.pop() as string;
    for (const [name, reads] of edges) {
      if (seen.has(name)) continue;
      if (reads.has(next)) {
        seen.add(name);
        queue.push(name);
      }
    }
  }
  return seen;
}
