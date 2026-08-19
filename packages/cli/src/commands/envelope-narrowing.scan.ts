import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * WHICH `--json` DOCUMENTS ARE MISSING A FIELD THE SERVER SENT — DERIVED, NOT LISTED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ACTION CHOOSES WHAT TO KEEP BEFORE ANYTHING KNOWS WHICH CHANNEL IT IS ON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /folders` answers `{folders, assignments}` and `folder list` opened with
 *
 *     const folders = result.folders ?? result;
 *     printTable(folders, COLUMNS);
 *
 * `printTable` owns the `if (_jsonMode)` branch, so it is the only line that
 * knows whether a table or a document is wanted — and the narrowing happens the
 * line ABOVE it. By the time the branch runs, `assignments` is gone from both
 * arms. `--json`, the flag whose whole purpose is machine consumption, was the
 * one that could not answer "which folder is this agent in".
 *
 * That is a SHAPE, not an incident. A table takes one array, so the action takes
 * one array, and the document quietly inherits the table's taste. Nothing about
 * it is visible in a diff, in `tsc`, or in the output — the JSON is well-formed
 * and complete-looking, and a `jq` for the missing key returns `null`, which
 * reads as an empty field rather than as a field that was deleted upstream.
 *
 * So this scan asks the question directly, with the type checker rather than a
 * regular expression: **when a printer is handed one property of a response,
 * what happens to that response's OTHER properties?**
 *
 *   · every key read somewhere the caller can still see  -> nothing is lost
 *   · a key read nowhere, or only into the human channel -> REPORTED
 *
 * A grep cannot ask it. `result.folders ?? result` and `printList(result.items,
 * undefined, cols)` are the same defect in two spellings, and neither is
 * distinguishable by text from the many correct sites that pass a property of a
 * SINGLE-key envelope, where there is nothing else to lose.
 *
 * ── THE TWO `isJsonMode()` RULES, AND WHY BOTH EXIST ────────────────────────
 *
 * 🚨 A KEY READ INTO THE TERMINAL IS STILL LOST FROM THE DOCUMENT, AND WITHOUT
 * THIS RULE THE SCAN REPORTS THE OPPOSITE. `analytics query` reads `rowCount`,
 * `truncated` and `executionTimeMs` — inside `if (!isJsonMode())`, onto stderr.
 * A naive "is this key mentioned anywhere in the action" test sees three reads
 * and calls the command clean, while `--json` still cannot tell a complete
 * answer from a truncated one. A read under `!isJsonMode()` therefore does NOT
 * count.
 *
 * ⚠️ AND THE MIRROR OF IT: a printer CALL under `!isJsonMode()` writes no
 * document at all, so it cannot drop a field from one. `tracing get` prints the
 * whole trace with `printRecord` and then renders `trace.generations` as a
 * second table guarded exactly that way. Without this arm the scan reports a
 * command whose document is already complete.
 *
 * Both arms key on the same syntactic fact, and the fact is a deliberate idiom
 * in this package rather than a coincidence — `output.ts` exports `isJsonMode`
 * for precisely this.
 *
 * ── WHAT THIS DELIBERATELY CANNOT SEE ───────────────────────────────────────
 *
 * 🚨 SAYING SO IS THE POINT. A gate whose documentation claims completeness is
 * how a whole class reads as closed:
 *
 *   · **an action that builds its own document** with `console.log(JSON.stringify
 *     (x))`. The shape is whatever that expression evaluates to, and nothing
 *     syntactic knows. `json-shape.scan.ts` refuses the same population for the
 *     same reason;
 *   · **a narrowing behind a helper**. The walk resolves an identifier through
 *     its own initializer and no further, so `renderFolders(result)` hides
 *     whatever it does inside;
 *   · **a field the SERVER sends and the SDK's type does not declare.** The
 *     population is the declared type, so an undeclared key is invisible here
 *     AND to every consumer reading the SDK — a different defect, gated
 *     elsewhere by the response-contract check;
 *   · **a key dropped inside a nested object** rather than at the top level.
 *     This reads one level.
 */

/** The printers whose payload argument decides what a `--json` document holds. */
const NARROWING_PRINTERS: ReadonlySet<string> = new Set(["printTable", "printList", "printRecord"]);

/** One response key that never reaches `--json`. */
export interface EnvelopeNarrowing {
  /** Path relative to `src/`, e.g. `commands/folder.ts`. */
  readonly file: string;
  /** 1-based line of the printer call. */
  readonly line: number;
  /** The printer that received the narrowed payload. */
  readonly printer: string;
  /** The response variable the payload was taken off. */
  readonly source: string;
  /** The one key the printer was handed. */
  readonly taken: string;
  /** Keys of the response's declared type that no visible read reaches, sorted. */
  readonly lost: readonly string[];
}

/** `src/` of this package, resolved from THIS file so the cwd cannot change it. */
export function defaultScanRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts")) return [];
    return [full];
  });
}

/** Is this call `isJsonMode()`, however it was imported? */
function isJsonModeCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression)) return node.expression.text === "isJsonMode";
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "isJsonMode";
  }
  return false;
}

/**
 * Does this node only run when `--json` is OFF?
 *
 * True when some enclosing `if (!isJsonMode())` has the node in its THEN branch,
 * or some enclosing `if (isJsonMode())` has it in the ELSE. Both spellings are
 * in the tree and they mean the same thing.
 */
function humanOnly(node: ts.Node): boolean {
  let child: ts.Node = node;
  let cursor: ts.Node | undefined = node.parent;

  while (cursor !== undefined) {
    if (ts.isIfStatement(cursor)) {
      const condition = cursor.expression;
      const negated =
        ts.isPrefixUnaryExpression(condition) &&
        condition.operator === ts.SyntaxKind.ExclamationToken &&
        isJsonModeCall(condition.operand);

      if (negated && cursor.thenStatement === child) return true;
      if (isJsonModeCall(condition) && cursor.elseStatement === child) return true;
    }
    child = cursor;
    cursor = cursor.parent;
  }

  return false;
}

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
function insideEnvelopeCallback(node: ts.Node): boolean {
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

/** The function body this node sits in — the unit a response variable lives in. */
function enclosingBody(node: ts.Node): ts.Node {
  let cursor: ts.Node | undefined = node;
  while (cursor !== undefined) {
    if (
      ts.isArrowFunction(cursor) ||
      ts.isFunctionExpression(cursor) ||
      ts.isFunctionDeclaration(cursor) ||
      ts.isMethodDeclaration(cursor)
    ) {
      return cursor.body ?? cursor;
    }
    cursor = cursor.parent;
  }
  return node;
}

/**
 * Peel the wrappers a narrowing is written behind.
 *
 * `result.folders ?? result` takes the LEFT: the `??` is dead where the type is
 * non-nullable, and where it is not, the left is still the intended payload.
 * `Array.isArray(x) ? x : [x]` takes the true arm for the same reason.
 */
function unwrap(expression: ts.Expression): ts.Expression {
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
    if (
      ts.isBinaryExpression(cursor) &&
      cursor.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      cursor = cursor.left;
      continue;
    }
    if (ts.isConditionalExpression(cursor)) {
      cursor = cursor.whenTrue;
      continue;
    }
    return cursor;
  }
}

/** The property access a printer argument ultimately reads, through one alias. */
function resolveAccess(
  argument: ts.Expression,
  checker: ts.TypeChecker,
  depth = 0
): ts.PropertyAccessExpression | null {
  if (depth > 6) return null;

  const expression = unwrap(argument);
  if (ts.isPropertyAccessExpression(expression)) return expression;

  if (ts.isIdentifier(expression)) {
    const declaration = checker.getSymbolAtLocation(expression)?.declarations?.[0];
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined
    ) {
      return resolveAccess(declaration.initializer, checker, depth + 1);
    }
  }

  return null;
}

/**
 * Every key of `name` this body reads somewhere a `--json` caller can still see.
 *
 * Handing the object WHOLE to a printer counts as reading all of it — that is
 * what `printEnvelope(result, …)` does, and it is the cure this scan exists to
 * push people towards, so it must not be reported as the disease.
 */
function keysReachingTheDocument(body: ts.Node, name: string): Set<string> | "all" {
  const read = new Set<string>();
  let whole = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !humanOnly(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (callee !== null && callee.startsWith("print")) {
        for (const argument of node.arguments) {
          const bare = unwrap(argument);
          if (ts.isIdentifier(bare) && bare.text === name) whole = true;
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name &&
      !humanOnly(node)
    ) {
      read.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(body);

  return whole ? "all" : read;
}

/** Every place a printer is handed one key of a multi-key response. */
export function scanEnvelopeNarrowing(root = defaultScanRoot()): EnvelopeNarrowing[] {
  const fileNames = sourceFiles(root);
  const program = ts.createProgram(fileNames, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    noEmit: true
  });
  const checker = program.getTypeChecker();
  const found: EnvelopeNarrowing[] = [];

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);

      if (!ts.isCallExpression(node)) return;
      if (!ts.isIdentifier(node.expression)) return;
      if (!NARROWING_PRINTERS.has(node.expression.text)) return;
      if (node.arguments.length === 0) return;

      // A printer under `!isJsonMode()` writes no document, so it cannot drop a
      // field from one. Neither does one inside a `printEnvelope` callback.
      if (humanOnly(node)) return;
      if (insideEnvelopeCallback(node)) return;

      const access = resolveAccess(node.arguments[0], checker);
      if (access === null || !ts.isIdentifier(access.expression)) return;

      const responseName = access.expression.text;
      const declared = checker
        .getTypeAtLocation(access.expression)
        .getProperties()
        .map((symbol) => symbol.getName());

      // One key is the whole response; narrowing it loses nothing.
      if (declared.length < 2) return;

      const reached = keysReachingTheDocument(enclosingBody(node), responseName);
      if (reached === "all") return;

      const lost = declared.filter((key) => !reached.has(key)).sort();
      if (lost.length === 0) return;

      found.push({
        file: path.relative(root, source.fileName),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        printer: node.expression.text,
        source: responseName,
        taken: access.name.text,
        lost
      });
    };

    visit(source);
  }

  return found.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

/** `commands/folder.ts printTable folders` — stable across an edit above it. */
export function narrowingKey(narrowing: EnvelopeNarrowing): string {
  return `${narrowing.file} ${narrowing.printer} ${narrowing.taken}`;
}
