import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * WHICH OF THE FIVE `--json` SHAPES EACH LEAF PRINTS — DERIVED FROM THE CODE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SIX SHAPES ARE SIX FUNCTIONS, SO THIS IS A DEFINITION AND NOT A GUESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--json` is not uniformly wrapped across this CLI, and the wrapping is not
 * derivable from a command's NAME: `agent list` answers `{data, meta}`,
 * `task list` answers a bare array, `agent create` answers `{success, …}` and
 * `agent get` answers the resource flat. A caller who probes one command's
 * shape has learned nothing about the next, and the failure is SILENT — a `jq`
 * path against the wrong pattern returns `null`, which reads as an empty field
 * rather than as a wrong parse.
 *
 * What makes that mechanical rather than a matter of opinion is that every one
 * of those shapes is produced by exactly ONE function in `output.ts`, and each
 * of those functions has a single `if (_jsonMode)` branch:
 *
 *   printRecord(data, fields)   -> emitDocument(data)          the object, flat
 *   printList(data, meta, cols) -> emitDocument({ data, meta })
 *   printTable(rows, cols)      -> emitDocument(rows)          a bare array
 *   printSuccess(message, data) -> emitDocument({ success: true, message, …data })
 *   printDryRun(message, data)  -> emitDocument({ dryRun: true, message, …data })
 *   printEnvelope(env, render) -> emitDocument(env)           the response itself
 *
 * So "which shape does this leaf print" is the same question as "which of those
 * six does this leaf's action reach", and that question is answered by reading
 * the code rather than by running it. A hand-written table of 508 shapes beside
 * an evolving CLI is the defect this module deletes: it goes stale in complete
 * silence, and a wrong shape in `--help` is worse than none — it is a confident
 * sentence that sends a caller to write the wrong parse.
 *
 * ── WHAT THIS DELIBERATELY REFUSES TO ANSWER ────────────────────────────────
 *
 * 🚨 SILENCE IS A RESULT HERE, AND IT IS THE MOST IMPORTANT ONE. Three cases
 * get NO classification and therefore NO help line:
 *
 *   · a leaf that reaches NONE of the six — around forty commands build their
 *     document with a bare `console.log(JSON.stringify(x))` or hand it to
 *     `emitDocument` through a helper, and the shape is then whatever that
 *     expression evaluates to. Nothing syntactic knows;
 *   · a leaf that reaches MORE THAN ONE — the shape depends on a branch, so any
 *     single sentence about it is false on the other arm;
 *   · a leaf whose registration this scan cannot tie to a command PATH.
 *
 * Reporting those as "unclassified" rather than defaulting one of them is the
 * whole safety property. A default would be a claim, and a claim nobody
 * measured is exactly what this programme exists to remove.
 *
 * ── WHY THE PRINTERS ARE TERMINALS ──────────────────────────────────────────
 *
 * ⚠️ `printList` CALLS `printTable` — on its NON-json branch, to draw the table.
 * A call graph that expands the six reports `printList+printTable` for all 53
 * list commands and classifies none of them, because two shapes look like a
 * branch. So the walk stops AT a printer: reaching one is the answer, never a
 * question to ask again one level down.
 *
 * ── WHY THE PATH IS RESOLVED FROM THE RECEIVER ──────────────────────────────
 *
 * A `.command("get")` literal is not a command path, and `(file, name)` is not
 * a key: many leaves share a name with a sibling in the same file (a namespace
 * can easily carry several `list`s). So the receiver of each `.command()`
 * call is resolved back through local variables and wrapper calls
 * (`confirmable(x)`, `addPaginationOptions(x)`) until it bottoms out at the
 * registrar's own parameter, which yields a path RELATIVE to whatever that
 * parameter is at runtime. The caller joins that suffix onto the real command
 * tree, where the absolute path is known.
 */

/** The six, and nothing else. Each is a terminal in the walk below. */
export const SHAPE_PRINTERS = [
  "printRecord",
  "printList",
  "printTable",
  "printSuccess",
  "printDryRun",
  "printEnvelope"
] as const;

/**
 * `printEnvelope` OUTRANKS whatever printer runs inside its callback.
 *
 * 🚨 WITHOUT THIS RULE, ADOPTING THE PRINTER THAT FIXES A COMMAND'S SHAPE
 * DELETES THAT COMMAND'S SHAPE LINE. `printEnvelope(result, () =>
 * printTable(rows, cols))` reaches two of the six, and two is refused as
 * `branches` — so `folder list` would have gone from a WRONG line ("a bare
 * array") to NO line, and the help would have got quieter for a command that
 * had just been made answerable.
 *
 * It is a definition rather than a tie-break. `printEnvelope` owns the only
 * `if (_jsonMode)` branch on the path and never calls its callback under
 * `--json`, so a printer inside that callback is human-channel BY
 * CONSTRUCTION. There is no branch for the two to disagree about: the document
 * is the envelope, always.
 */
const DOMINANT_PRINTER = "printEnvelope";

export type ShapePrinter = (typeof SHAPE_PRINTERS)[number];

const PRINTER_SET: ReadonlySet<string> = new Set(SHAPE_PRINTERS);

/**
 * Names that mean "this code WRITES a `--json` document itself", so a printer
 * beside them may be on a branch `--json` never takes.
 *
 * 🚨 THIS IS NOT DEFENSIVENESS. WITHOUT IT THE SCAN SHIPS A FALSE SHAPE.
 * Measured: `workspace search` opens with
 *
 *     if (isJsonMode()) { console.log(JSON.stringify(res, null, 2)); return; }
 *
 * and only then falls through to `printTable`. The printer is real, it is in
 * the body, and it is UNREACHABLE under the one flag this whole module is about
 * — so classifying it yields "a bare array" for a command whose help correctly
 * says the document is the raw server object.
 *
 * 🚨 `isJsonMode` IS NOT A MARKER, AND PUTTING IT HERE COST 36 CORRECT
 * CLASSIFICATIONS. READING the flag is not WRITING a document: `printItems` and
 * `printImportResult` in `cloud-import.ts` call `printList` UNCONDITIONALLY and
 * consult the flag only to suppress a human-only footer underneath it. Their
 * `--json` shape is a determinate `{data, …}`, and treating the read as an
 * output decision dropped the whole cloud-import browse/search/import family
 * from the map.
 *
 * The two commands this refusal exists for are caught by the WRITE alone —
 * `workspace search` through `console.log(JSON.stringify(…))` in its action,
 * `role automation-settings` through the same shape inside `printStatedOrNothing`.
 * So the narrower rule loses nothing it was built to catch.
 */
const SELF_JSON_MARKERS: ReadonlySet<string> = new Set(["emitDocument"]);

/**
 * The error document's own writers, and they are TERMINALS like the printers.
 *
 * 🚨 EVERY ACTION'S `catch` REACHES `emitDocument` THROUGH ONE OF THESE. The
 * root epilogue documents the failure shape separately — `{"error":{…}}` on
 * stdout, exit 1 — and it is the same for every command, so it is not a second
 * SUCCESS shape and must not refuse a leaf. Following them marks the entire
 * tree.
 */
const ERROR_EMITTERS: ReadonlySet<string> = new Set([
  "handleError",
  "printCliError",
  "printFailure",
  "printNotFound",
  "refuse",
  "reportFailure"
]);

/**
 * 🚨 `JSON.stringify` IS DELIBERATELY NOT A MARKER ON ITS OWN, AND THAT IS
 * MEASURED. Actions call it to serialise a `--body` argument or to build an
 * error hint; treating every one of those as an output decision marked 481 of
 * 481 joined leaves as self-json and classified NOTHING. Only the shape that
 * actually WRITES a document counts, detected structurally: `console.log` (or
 * `process.stdout.write`) whose argument IS a `JSON.stringify` call.
 */
function bodyWritesJsonItself(body: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const name = dottedName(node.expression);
      const short = name.includes(".") ? (name.split(".").pop() as string) : name;
      if (SELF_JSON_MARKERS.has(name) || SELF_JSON_MARKERS.has(short)) {
        found = true;
        return;
      }
      if (
        (name === "console.log" || name === "process.stdout.write") &&
        node.arguments.some(
          (arg) => ts.isCallExpression(arg) && dottedName(arg.expression) === "JSON.stringify"
        )
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/**
 * Does this action, or anything it calls short of a printer, decide its own
 * `--json` output?
 *
 * 🚨 READING THE ACTION'S OWN BODY ALONE IS NOT ENOUGH, AND THE SECOND DEFECT
 * FOUND IN THIS SCAN WAS EXACTLY THAT SHAPE. `role automation-settings` calls
 * `printStatedOrNothing`, a helper in the same file whose body is
 *
 *     if (value !== null) { printRecord(value, fields); return true; }
 *     if (isJsonMode()) { console.log(JSON.stringify(null, null, 2)); }
 *
 * so the command answers a flat object OR the literal document `null`. Reading
 * only the action's body sees `printRecord` through the helper and nothing else,
 * and the line then promises "ONE FLAT OBJECT" for a command whose own help
 * correctly says it can emit `null`. Three reads in `role` share that helper.
 *
 * ⚠️ AND IT IS NOT ENOUGH TO ASK ONLY WHETHER A HELPER IS SELF-CONTRADICTORY.
 * A first version required a helper's own body to call a printer AND write a
 * document, on the reasoning that a write-only helper leaves the action with no
 * printer at all. `workflow test` breaks that: it prints a record WITHOUT
 * `--follow` and streams NDJSON through `runFollow` WITH it, so the action
 * reaches one printer and one write-only helper on different branches. It was
 * classified `record` while its own help said "--json EMITS NDJSON — one JSON
 * object per node state change, not one document". The contradiction control
 * caught it.
 *
 * So the question is asked at the ACTION: does anything it reaches, short of a
 * printer or an error emitter, write a document itself? Both terminal sets are
 * load-bearing — printers all consult the json flag internally, and every
 * `catch` block reaches `emitDocument` through `handleError`.
 */
function reachesSelfJson(
  seed: ReadonlySet<string>,
  file: string,
  index: SourceIndex,
  ownBody: ts.Node
): boolean {
  if (bodyWritesJsonItself(ownBody)) return true;

  const seen = new Map<string, Set<string>>();
  const queue: WalkStep[] = [...seed].map((call) => ({ file, call }));

  while (queue.length > 0) {
    const step = queue.pop() as WalkStep;
    const short = shortName(step.call);

    if (PRINTER_SET.has(step.call) || PRINTER_SET.has(short)) continue;
    if (ERROR_EMITTERS.has(step.call) || ERROR_EMITTERS.has(short)) continue;

    const site = resolveDeclaration(index, step.file, step.call);
    if (site === null) continue;

    if (!markSeen(seen, site)) continue;

    const declaring = index.get(site.file);
    if (declaring === undefined) continue;

    for (const declared of declaring.bodies.get(site.name) ?? []) {
      if (bodyWritesJsonItself(declared)) return true;
    }

    for (const next of declaring.calls.get(site.name) ?? []) {
      queue.push({ file: site.file, call: next });
    }
  }

  return false;
}

/** One classified registration, keyed by its path RELATIVE to the registrar's root. */
export interface ScannedLeaf {
  /** `src/commands/*.ts` basename the registration is written in. */
  readonly sourceModule: string;
  /** Space-joined path from the registrar's own `Command` parameter, e.g. `node get`. */
  readonly relativePath: string;
  /**
   * The printers this registration's action reaches, sorted. Exactly one is a
   * classification; zero or more than one is deliberately not.
   */
  readonly printers: readonly ShapePrinter[];
  /**
   * The action decides its own `--json` output. See {@link SELF_JSON_MARKERS}.
   * When true, `printers` describes the HUMAN branch and must not be published.
   */
  readonly selfJson: boolean;
}

/** A file this scan does not read. */
function isScannable(file: string): boolean {
  const base = path.basename(file);
  return base.endsWith(".ts") && !base.endsWith(".test.ts") && !base.endsWith(".generated.ts");
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannable(full) ? [full] : [];
  });
}

/** The dotted name of an expression: `printRecord`, `client.agents.get`. */
function dottedName(expression: ts.Expression): string {
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
function callsIn(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) names.add(dottedName(node.expression));
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}

/** A function as DECLARED: the file it is written in, and its name in that file. */
interface DeclarationSite {
  readonly file: string;
  readonly name: string;
}

/** One position in a walk: a call name, and the file whose scope it was written in. */
interface WalkStep {
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
interface ModuleIndex {
  /** Declared name -> every call made by a declaration of that name in THIS file. */
  readonly calls: Map<string, Set<string>>;
  /** Declared name -> every body declared under that name in THIS file. */
  readonly bodies: Map<string, ts.Node[]>;
  /** Local binding -> the file it came from and the name it is declared under there. */
  readonly imports: Map<string, DeclarationSite>;
  /** `import * as ns` binding -> the file it names. */
  readonly namespaces: Map<string, string>;
}

type SourceIndex = ReadonlyMap<string, ModuleIndex>;

/** The last segment of a dotted call name, which is how the function is DECLARED. */
function shortName(call: string): string {
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
function markSeen(seen: Map<string, Set<string>>, site: DeclarationSite): boolean {
  const names = seen.get(site.file) ?? new Set<string>();
  if (names.has(site.name)) return false;
  names.add(site.name);
  seen.set(site.file, names);
  return true;
}

/** Every named function in a file, with the calls it makes and its body. */
function indexDeclarations(source: ts.SourceFile, into: ModuleIndex): void {
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
function resolveSpecifier(
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
function indexImports(
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
function buildIndex(parsed: readonly { file: string; source: ts.SourceFile }[]): SourceIndex {
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

/**
 * Which DECLARATION does a call written in `file` actually reach?
 *
 * The file's own declarations win, then its own imports. 🚨 A NAME THAT IS
 * NEITHER IS UNRESOLVED, AND THE EDGE IS DROPPED RATHER THAN GUESSED — falling
 * back to a tree-wide lookup would reinstate the exact collision this index
 * exists to remove, and it would do it only on the names most likely to collide.
 *
 * `transport.send` in a file that neither declares nor imports `send` therefore
 * ends the walk, which is the correct reading: nothing syntactic here knows what
 * `transport` is.
 */
function resolveDeclaration(
  index: SourceIndex,
  file: string,
  call: string
): DeclarationSite | null {
  const module = index.get(file);
  if (module === undefined) return null;

  const parts = call.split(".");

  if (parts.length > 1) {
    const namespaceFile = module.namespaces.get(parts[0]);
    if (namespaceFile !== undefined && index.get(namespaceFile)?.calls.has(parts[1]) === true) {
      return { file: namespaceFile, name: parts[1] };
    }
  }

  for (const candidate of parts.length > 1 ? [call, shortName(call)] : [call]) {
    if (module.calls.has(candidate)) return { file, name: candidate };

    const imported = module.imports.get(candidate);
    if (imported !== undefined && index.get(imported.file)?.calls.has(imported.name) === true) {
      return imported;
    }
  }

  return null;
}

/**
 * Which of the six does this set of calls reach, transitively?
 *
 * The six are TERMINALS: reaching one records it and stops. See the header for
 * why expanding `printList` classifies all 53 list commands as ambiguous.
 */
function reachedPrinters(seed: ReadonlySet<string>, file: string, index: SourceIndex): Set<string> {
  const seen = new Map<string, Set<string>>();
  const found = new Set<string>();
  const queue: WalkStep[] = [...seed].map((call) => ({ file, call }));

  while (queue.length > 0) {
    const step = queue.pop() as WalkStep;

    // A method call (`this.render`, `client.agents.get`) is keyed by its last
    // segment, because that is how the function is DECLARED.
    const short = shortName(step.call);

    if (PRINTER_SET.has(step.call)) {
      found.add(step.call);
      continue;
    }
    if (PRINTER_SET.has(short)) {
      found.add(short);
      continue;
    }

    const site = resolveDeclaration(index, step.file, step.call);
    if (site === null) continue;

    if (!markSeen(seen, site)) continue;

    for (const next of index.get(site.file)?.calls.get(site.name) ?? []) {
      queue.push({ file: site.file, call: next });
    }
  }

  return found.has(DOMINANT_PRINTER) ? new Set([DOMINANT_PRINTER]) : found;
}

/** Strip `await` and parentheses, so `await confirmable(x)` reads as `confirmable(x)`. */
function unwrap(expression: ts.Expression): ts.Expression {
  let cursor = expression;
  while (ts.isAwaitExpression(cursor) || ts.isParenthesizedExpression(cursor)) {
    cursor = cursor.expression;
  }
  return cursor;
}

/** Is this call `<something>.command("<literal>")`? */
function commandName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "command") return null;

  const first = node.arguments[0];
  if (first === undefined || !ts.isStringLiteralLike(first)) return null;

  // `.command("node get <id>")` — commander takes the name up to the first
  // space, and the rest declares arguments.
  return first.text.split(/\s+/)[0] ?? null;
}

/**
 * The path a `.command()` call sits at, relative to the registrar's own
 * `Command` parameter, or `null` when the receiver cannot be resolved.
 *
 * Resolution walks three shapes and refuses everything else:
 *   · `parent.command("x")`               — the receiver is another `.command()`
 *   · `someVariable.command("x")`         — resolved through its initializer
 *   · `wrapper(parent.command("x")).opt()` — descends into the wrapper's argument
 */
function relativePathOf(call: ts.CallExpression, source: ts.SourceFile): string[] | null {
  const segments: string[] = [];
  let cursor: ts.Node = call;
  const guard = new Set<ts.Node>();

  for (;;) {
    if (guard.has(cursor)) return null;
    guard.add(cursor);

    const name = commandName(cursor);
    if (name === null) return null;
    segments.unshift(name);

    // The receiver: the expression `.command` was read off.
    let receiver: ts.Expression = unwrap(
      ((cursor as ts.CallExpression).expression as ts.PropertyAccessExpression).expression
    );

    // Peel any chained builder calls back to whatever produced the object:
    // `parent.command("x").description(…).option(…)` -> `parent.command("x")`.
    for (;;) {
      if (
        ts.isCallExpression(receiver) &&
        ts.isPropertyAccessExpression(receiver.expression) &&
        receiver.expression.name.text !== "command"
      ) {
        receiver = unwrap(receiver.expression.expression);
        continue;
      }
      // `confirmable(x)`, `addPaginationOptions(x)` — a wrapper returning its
      // own argument. Descend into the first argument; a wrapper that returned
      // something else would resolve to a path that does not exist in the tree,
      // which the caller reports rather than trusts.
      if (ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression)) {
        const inner = receiver.arguments[0];
        if (inner === undefined) return null;
        receiver = unwrap(inner);
        continue;
      }
      break;
    }

    if (ts.isCallExpression(receiver) && commandName(receiver) !== null) {
      cursor = receiver;
      continue;
    }

    if (ts.isIdentifier(receiver)) {
      const initializer = initializerOf(receiver.text, source);
      // No initializer means the identifier is the registrar's own parameter —
      // the bottom of the chain, and the point the path is relative TO.
      if (initializer === null) return segments;

      const resolved = unwrap(initializer);
      let inner: ts.Expression = resolved;
      for (;;) {
        if (
          ts.isCallExpression(inner) &&
          ts.isPropertyAccessExpression(inner.expression) &&
          inner.expression.name.text !== "command"
        ) {
          inner = unwrap(inner.expression.expression);
          continue;
        }
        if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
          const arg = inner.arguments[0];
          if (arg === undefined) return null;
          inner = unwrap(arg);
          continue;
        }
        break;
      }

      if (ts.isCallExpression(inner) && commandName(inner) !== null) {
        cursor = inner;
        continue;
      }
      return null;
    }

    return null;
  }
}

/** The initializer of a `const x = …` declared anywhere in this file, or null. */
function initializerOf(name: string, source: ts.SourceFile): ts.Expression | null {
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
  visit(source);

  return found;
}

/** The body of a `.action(fn)` call's handler. */
function handlerBody(outer: ts.CallExpression): ts.Node | null {
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
function actionBodyOf(call: ts.CallExpression, source: ts.SourceFile): ts.Node | null {
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

/** `<name>.action(fn)` written as its own statement, or null. */
function deferredActionBody(name: string, source: ts.SourceFile): ts.Node | null {
  let found: ts.Node | null = null;

  const visit = (node: ts.Node): void => {
    if (
      found === null &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "action" &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === name
    ) {
      found = handlerBody(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

/** Scan a source tree and classify every `.command()` registration it can resolve. */
export function scanJsonShapes(root: string): ScannedLeaf[] {
  const parsed = sourceFiles(root).map((file) => ({
    file,
    source: ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  }));

  const index = buildIndex(parsed);

  const leaves: ScannedLeaf[] = [];

  for (const { file, source } of parsed) {
    const visit = (node: ts.Node): void => {
      if (commandName(node) !== null) {
        const call = node as ts.CallExpression;
        const relative = relativePathOf(call, source);
        const body = actionBodyOf(call, source);

        if (relative !== null && body !== null) {
          const own = callsIn(body);
          const printers = [...reachedPrinters(own, file, index)]
            .filter((name): name is ShapePrinter => PRINTER_SET.has(name))
            .sort();

          leaves.push({
            sourceModule: path.basename(file),
            relativePath: relative.join(" "),
            printers,
            selfJson: reachesSelfJson(own, file, index, body)
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return leaves;
}
