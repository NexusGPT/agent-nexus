import ts from "typescript";

/** A function as DECLARED: the file it is written in, and its name in that file. */
export interface DeclarationSite {
  readonly file: string;
  readonly name: string;
}

/** One position in a walk: a call name, and the file whose scope it was written in. */
export interface WalkStep {
  readonly file: string;
  readonly call: string;
}

/**
 * One file's declarations and the bindings it imported.
 *
 * 🚨 THE KEY IS THE FILE PLUS THE NAME, AND THAT IS THE WHOLE POINT OF THIS
 * STRUCTURE. A single tree-wide map keyed by the bare name makes two files that
 * each declare `visit` ONE node, so a walk that starts in either can fall into
 * the other's body. Measured on this package: 851 declared names the scan
 * reads, 25 of them declared in more than one file, `visit` in 13.
 *
 * The failure that surfaced it: `mcp.ts` calls `transport.send(...)`, which
 * resolved to a file-scope `send` in the agent-eval command module — a function
 * `mcp.ts` neither imports nor can reach. `mcp serve` was classified from that
 * body.
 *
 * ⚠️ AND IT IS BIDIRECTIONAL, WHICH IS WHY UNIONING WAS NOT A SAFE DEFAULT. The
 * comment this replaced argued a union "can add printers and never remove one,
 * so the worst outcome is MORE than one printer, which is refused". That holds
 * only for a leaf that already reaches one. A leaf reaching ZERO printers on
 * its own, handed a foreign body that reaches exactly one, is CLASSIFIED — a
 * confidently wrong `--help` sentence rather than a missing one. The same union
 * over `bodies` marks a leaf `selfJson` from a stranger's `JSON.stringify`,
 * which deletes a correct line.
 */
export interface ModuleIndex {
  /** Declared name -> every call made by a declaration of that name in THIS file. */
  readonly calls: Map<string, Set<string>>;
  /** Declared name -> every body declared under that name in THIS file. */
  readonly bodies: Map<string, ts.Node[]>;
  /** Local binding -> the file it came from and the name it is declared under there. */
  readonly imports: Map<string, DeclarationSite>;
  /** `import * as ns` binding -> the file it names. */
  readonly namespaces: Map<string, string>;
}

export type SourceIndex = ReadonlyMap<string, ModuleIndex>;

/** The last segment of a dotted call name, which is how the function is DECLARED. */
export function shortName(call: string): string {
  return call.includes(".") ? (call.split(".").pop() as string) : call;
}

/**
 * Mark a declaration visited; false when it already was.
 *
 * Nested — file, then name — rather than a single key joining the two with a
 * separator. A joined key needs a byte neither half can contain, which means a
 * NUL, and a literal NUL in source is invisible: it renders as a SPACE, it
 * survives tsc, ESLint and every spec in this package, and an edit made against
 * that rendering delivers a second one. Nesting removes the delimiter, so there
 * is nothing left to corrupt.
 */
export function markSeen(seen: Map<string, Set<string>>, site: DeclarationSite): boolean {
  const names = seen.get(site.file) ?? new Set<string>();
  if (names.has(site.name)) return false;
  names.add(site.name);
  seen.set(site.file, names);
  return true;
}
