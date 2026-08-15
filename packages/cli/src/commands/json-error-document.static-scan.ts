/**
 * THE STATIC SIBLING OF THE ONE-DOCUMENT GATE — the branches a driver cannot
 * enter.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND INSTRUMENT, WHEN `json-one-document.test.ts` DRIVES EVERY LEAF
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That gate is the stronger instrument and stays the primary one: it RUNS every
 * leaf and PARSES what each put on stdout, which is the only way to observe the
 * contract as a caller experiences it. Its limit is not depth. It is REACH.
 *
 * A driven scan can only measure the branch it can reach, and three things it
 * cannot change decide which branch that is:
 *
 *   - **It cannot satisfy an equality.** The SDK stub is a self-similar proxy,
 *     so every field is truthy and no field is a particular string. A command
 *     branching on `result.status === "success"` takes the ELSE arm — or, where
 *     a guard refuses first, never reaches either.
 *   - **It cannot get past a hand-rolled required-option guard.** The argv
 *     synthesizer passes MANDATORY options only, because passing every declared
 *     flag would fire mutually exclusive ones together. A command that declares
 *     `--operation-id` as a plain option and then refuses without it stops at
 *     that refusal, and the whole action body below it is unmeasured.
 *   - **It always passes `--yes`.** Without it a confirmation refuses (by
 *     design), so a destructive command would never reach its printer. Which
 *     means the REFUSAL PATH of every confirmation — the branch a script always
 *     takes — is the one branch the gate structurally cannot drive.
 *
 * Every one of those reads as `clean` or `error-document`. **A branch the
 * instrument cannot enter is not a branch it found compliant**, and a ledger at
 * zero says nothing about any of them.
 *
 * Measured: with both of that gate's ledgers at zero and every leaf green, NINE
 * call sites still failed under `--json` with prose on stderr and an EMPTY
 * stdout — including both halves of one command's own flag pair, where the same
 * action refused `--connection-id` with a document and its adjacent
 * `--access-token` with nothing.
 *
 * ── AND A HAND-WRITTEN CENSUS FOUND SIX OF THE NINE ──────────────────────────
 *
 * `json-failure-doors.test.ts` beside this file is that census: it drives six
 * named doors by hand and asserts one error document on each. It is a good
 * test and it is the reason this file states its own reach in the same breath —
 * because the three it does NOT name were found by nothing but this walk, and
 * all three are in `external-tool`, where the prose sits in a HELPER one call
 * away from the exit:
 *
 *     external-tool delete       printToolHasAttachmentsError, then exit 1
 *     external-tool update       printSpecBreakingChangeError, then exit 1
 *     external-tool update-spec  printSpecBreakingChangeError, then exit 1
 *
 * That is the whole case for a derived population over a written one, measured
 * rather than argued: a hand-listed spec is evidence about the doors somebody
 * thought of, and the three nobody thought of are the three that shipped.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CHECKS, AND WHY THE SHAPE IS SYNTACTIC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * One rule: **a non-zero exit reached after prose went to stderr, with no JSON
 * document emitted on the way.** That is the defect verbatim, and it is a
 * SYNTACTIC pairing — two statements in one scope — so an AST walk reads it
 * directly rather than inferring it. No stub, no runtime, no reachability
 * problem: a branch nobody can drive is read exactly like one everybody drives.
 *
 * This is strictly WEAKER than the driven gate in general (it proves nothing
 * about what a command actually prints) and strictly STRONGER on this one
 * shape. Both, or neither is honest.
 *
 * ── Three properties the rule needs, and each cost a false reading ───────────
 *
 * 1. **EXCLUSIVE BRANCHES DO NOT FOLD INTO EACH OTHER.** `if (ok)
 *    printRecord(x); else { console.error(y); process.exitCode = 1; }` — folding
 *    the THEN arm's document into the ELSE arm marks the defect compliant, and
 *    that arm is `external-tool test-auth`, one of the two findings this gate
 *    was built from. So an `if` / `try` / `switch` / `?:` contributes only its
 *    CONDITION to the sequence; each arm is walked with the state as it stood
 *    BEFORE the branch.
 * 2. **AN EXIT IS COUNTED WHERE IT IS WRITTEN, ONCE.** A deep search from each
 *    enclosing statement finds the same `process.exitCode = 1` at every level
 *    above it, which triples a count and reports one site three times.
 * 3. **"DOES THIS HELPER EMIT A DOCUMENT" IS TRANSITIVE.** `runDeploymentWatch`
 *    writes progress to stderr and returns an exit code; its document comes
 *    from `reportWatchOutcome`, in another file. Classified one level deep it
 *    reads as prose-only and its two compliant call sites read as violations.
 *    So the classification is a fixed point over the call graph.
 *
 * ── The suppression, and it is a real design in this tree ────────────────────
 *
 * A document emitted EARLIER in the same sequence suppresses the report, and
 * that is not leniency — it is `emitDocument`'s FIRST-WINS rule, which this
 * package chose deliberately: the payload keeps stdout, the error goes to
 * stderr, the exit code still says 1. `auth switch` (a success document, then a
 * warning that the switch is shadowed, then exit 1) and `channel
 * whatsapp-template submit-approval` (the template record, then a rejected
 * status, then exit 1) are both that shape on purpose. A rule that called them
 * violations would be describing a CLI nobody wants.
 *
 * `console.log` is NOT stderr prose and never triggers this — the human channel
 * is `console.log`'s job, and under `--json` the printers suppress it
 * themselves.
 */

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * Calls that put an unparseable sentence on STDERR.
 *
 * `printWarning` is here beside `console.error` because it IS a `console.error`
 * with a colour — right for a warning that accompanies a result, wrong as the
 * only thing a failing command says. One of the two findings this gate was
 * built from was exactly that: `printWarning` + `process.exitCode = 1`.
 */
const STDERR_PROSE = new Set(["console.error", "console.warn", "printWarning"]);

/**
 * Calls that put a JSON document on stdout, or route one through the funnel.
 *
 * `handleError`, `refuse`, `reportFailure`, `printFailure` and `printNotFound`
 * all go through `printCliError` → `emitDocument`. The payload printers go
 * through `emitDocument` directly. A bare `console.log(JSON.stringify(...))` is
 * counted too — around forty commands build their document that way rather than
 * through a printer, and a rule that ignored them would report every one of
 * those commands as a violation.
 */
const DOCUMENT_EMITTERS = new Set([
  "emitDocument",
  "handleError",
  "printDryRun",
  "printFailure",
  "printList",
  "printNotFound",
  "printPage",
  "printRecord",
  "printSuccess",
  "refuse",
  "reportFailure"
]);

/** A file this scan deliberately does not read. */
function isScannable(file: string): boolean {
  const base = path.basename(file);
  return (
    base.endsWith(".ts") &&
    !base.endsWith(".test.ts") &&
    // Bundled skill markdown, embedded as string literals. Megabytes of other
    // people's shell scripts, none of it this CLI's control flow.
    !base.endsWith(".generated.ts") &&
    // This file and its gate describe the defect in prose and in fixtures.
    !base.startsWith("json-error-document.")
  );
}

/** Every scannable `.ts` under a directory. */
export function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannable(full) ? [full] : [];
  });
}

/** The dotted name of an expression: `console.error`, `refuse`, `a.b.c`. */
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

/** `console.log(JSON.stringify(x))` — a document built without a printer. */
function isBareJsonLog(node: ts.CallExpression): boolean {
  if (dottedName(node.expression) !== "console.log") return false;
  return node.arguments.some(
    (arg) => ts.isCallExpression(arg) && dottedName(arg.expression) === "JSON.stringify"
  );
}

/** Strip `await`, so `= await refuse(...)` reads like `= refuse(...)`. */
function unwrap(expression: ts.Expression): ts.Expression {
  let cursor = expression;
  while (ts.isAwaitExpression(cursor) || ts.isParenthesizedExpression(cursor)) {
    cursor = cursor.expression;
  }
  return cursor;
}

/** A body that is DEFINED here and RUN somewhere else. */
function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** The non-zero exit this NODE performs, or null. Never a deep search. */
function exitCodeOf(node: ts.Node): { code: string; viaEmitter: boolean } | null {
  // process.exit(<n>)
  if (ts.isCallExpression(node) && dottedName(node.expression) === "process.exit") {
    const arg = node.arguments[0];
    const literal = arg !== undefined && ts.isNumericLiteral(arg) ? arg.text : "0";
    return literal === "0" ? null : { code: literal, viaEmitter: false };
  }

  // process.exitCode = <n> | <call>
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    dottedName(node.left) === "process.exitCode"
  ) {
    const right = unwrap(node.right);
    if (ts.isNumericLiteral(right)) {
      return right.text === "0" ? null : { code: right.text, viaEmitter: false };
    }
    // `process.exitCode = handleError(err)` / `= refuse(...)`: the exit code IS
    // the emitter's return value, so the document and the status are the same
    // statement and cannot drift apart at a call site.
    if (ts.isCallExpression(right)) {
      const name = dottedName(right.expression);
      return { code: `${name}(…)`, viaEmitter: DOCUMENT_EMITTERS.has(name) };
    }
    return { code: "<computed>", viaEmitter: false };
  }

  return null;
}

interface FunctionFacts {
  /** Writes prose to stderr, itself or through something it calls. */
  prose: boolean;
  /** Emits a JSON document, itself or through something it calls. */
  document: boolean;
  /** Every name it calls, for the fixed point below. */
  readonly calls: Set<string>;
}

/** Collect one function's own calls, ignoring the bodies nested inside it. */
function ownCalls(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (node !== body && isFunctionLike(node)) {
      // A callback's body IS run by whatever it is handed to, so its calls
      // count as this function's — a progress callback writing to stderr is
      // exactly how `runDeploymentWatch` writes prose.
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isCallExpression(node)) {
      names.add(dottedName(node.expression));
      if (isBareJsonLog(node)) names.add("emitDocument");
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}

/** Every named function in a file, with the calls it makes. */
function functionFacts(source: ts.SourceFile): Map<string, FunctionFacts> {
  const facts = new Map<string, FunctionFacts>();

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
      const calls = ownCalls(body);
      facts.set(name, {
        prose: [...calls].some((call) => STDERR_PROSE.has(call)),
        document: [...calls].some((call) => DOCUMENT_EMITTERS.has(call)),
        calls
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return facts;
}

/**
 * Functions that write prose to stderr and emit NO document, ANYWHERE below.
 *
 * ⚠️ WITHOUT THIS PASS THE RULE MISSES THE HELPER FORM, WHICH IS HALF THE
 * DEFECT. `printToolHasAttachmentsError(details); process.exitCode = 1;` puts
 * six `console.error` lines one call away from the exit, and a rule reading only
 * the exit's own scope sees a function call it knows nothing about. Three of the
 * eight sites this gate was built from are that shape.
 *
 * ⚠️ AND WITHOUT THE FIXED POINT IT MISREADS THE COMPLIANT ONES.
 * `runDeploymentWatch` writes progress to stderr and gets its document from
 * `reportWatchOutcome` in another file; one level deep it reads as prose-only
 * and its two correct call sites read as violations.
 *
 * The classification is by NAME rather than by symbol: two files in this
 * package really do declare a `confirmDestructive`, and a gate that considered
 * both because one was prose-only errs toward LOOKING, which is the direction a
 * gate should err in.
 */
export function proseOnlyHelpers(
  sources: readonly { readonly source: ts.SourceFile }[]
): Set<string> {
  const facts = new Map<string, FunctionFacts>();
  for (const { source } of sources) {
    for (const [name, fact] of functionFacts(source)) {
      const existing = facts.get(name);
      if (existing === undefined) {
        facts.set(name, fact);
        continue;
      }
      // Same name in two files: take the union. A gate that looks at both is
      // right more often than one that silently picks a file.
      existing.prose ||= fact.prose;
      existing.document ||= fact.document;
      for (const call of fact.calls) existing.calls.add(call);
    }
  }

  // Fixed point over the call graph, in both directions.
  let changed = true;
  while (changed) {
    changed = false;
    for (const fact of facts.values()) {
      for (const call of fact.calls) {
        const callee = facts.get(call);
        if (callee === undefined) continue;
        if (callee.document && !fact.document) {
          fact.document = true;
          changed = true;
        }
        if (callee.prose && !fact.prose) {
          fact.prose = true;
          changed = true;
        }
      }
    }
  }

  const proseOnly = new Set<string>();
  for (const [name, fact] of facts) {
    if (fact.prose && !fact.document) proseOnly.add(name);
  }
  return proseOnly;
}

export interface ProseRefusal {
  /** `<file>:<line>`, relative to the scanned root. */
  readonly where: string;
  /** What the walk saw, in one line. */
  readonly detail: string;
}

export interface StaticScanReport {
  readonly filesScanned: number;
  /**
   * Every non-zero exit statement the walk reached.
   *
   * The POPULATION, and the control on the walk itself: a parser that silently
   * stopped matching reports zero violations over zero exits, which reads
   * exactly like a clean tree.
   */
  readonly exitSites: number;
  /** Exits whose code is an emitter's return value. Compliant by construction. */
  readonly exitsThroughEmitter: number;
  /** Helper names classified prose-only, across every scanned file. */
  readonly proseHelpers: readonly string[];
  readonly violations: readonly ProseRefusal[];
}

/** What has definitely happened on the path to a statement. */
interface PathState {
  /** The last stderr-prose call on that path, if any. */
  prose: string | undefined;
  /** Has a document already claimed stdout on that path? */
  document: boolean;
}

/**
 * Fold the calls that DEFINITELY run before the next sibling statement.
 *
 * Stops at every exclusive branch and at every function body — an arm that may
 * not run, and a body that runs elsewhere, are not part of this sequence. The
 * branch's CONDITION is folded, because that always evaluates.
 */
function foldSequentialCalls(
  node: ts.Node,
  state: PathState,
  proseHelpers: ReadonlySet<string>
): void {
  const visit = (current: ts.Node): void => {
    if (isFunctionLike(current)) return;

    if (ts.isIfStatement(current)) return void visit(current.expression);
    if (ts.isConditionalExpression(current)) return void visit(current.condition);
    if (ts.isSwitchStatement(current)) return void visit(current.expression);
    if (ts.isTryStatement(current)) return;
    if (ts.isIterationStatement(current, /* lookInLabeledStatements */ false)) return;
    if (current !== node && ts.isBlock(current)) return;

    if (ts.isCallExpression(current)) {
      const name = dottedName(current.expression);
      if (DOCUMENT_EMITTERS.has(name) || isBareJsonLog(current)) state.document = true;
      if (STDERR_PROSE.has(name) || proseHelpers.has(name)) state.prose = name;
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
}

/**
 * Does this subtree emit a document, ignoring bodies that run elsewhere?
 *
 * Direct calls only — a HELPER that emits a document is not followed here, so a
 * document reaching stdout through one after the exit is not seen. That errs
 * toward REPORTING, which is the direction a gate should err in: the cost is a
 * false red somebody reads, never a defect nobody sees. The tree carries none
 * today; when one appears, widen this rather than ledger it.
 */
function emitsDocument(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found || isFunctionLike(current)) return;
    if (ts.isCallExpression(current)) {
      const name = dottedName(current.expression);
      if (DOCUMENT_EMITTERS.has(name) || isBareJsonLog(current)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/**
 * Does a document still reach stdout AFTER this exit, before the function ends?
 *
 * ⚠️ `process.exitCode = 1` DOES NOT TERMINATE, AND FORGETTING THAT MAKES THIS
 * GATE LIE. `channel whatsapp-template submit-approval` sets it inside a poll
 * loop, `break`s, and prints the template record — with the rejection status
 * inside it — several statements later. Read forward-only that is a violation;
 * it is the opposite, and reporting it would push someone to "fix" a command
 * that is already right.
 *
 * The walk climbs out of each enclosing scope because `break` leaves a loop and
 * not the function. It STOPS at a `return` or a `throw` standing beside the
 * exit, because nothing after those runs — which is why `refuse(…); return;`
 * stays reportable when the refusal is prose.
 */
function documentFollows(statement: ts.Node): boolean {
  let cursor: ts.Node = statement;

  while (cursor.parent !== undefined && !isFunctionLike(cursor.parent)) {
    const parent = cursor.parent;
    let past = false;
    let terminated = false;
    let found = false;

    ts.forEachChild(parent, (sibling) => {
      if (sibling === cursor) {
        past = true;
        return;
      }
      if (!past || terminated || found) return;
      // 🚨 A `catch` IS NOT WHAT FOLLOWS THE `try`. It is the OTHER path, and
      // every command action in this package is `try { … } catch (err) {
      // process.exitCode = handleError(err); }` — so counting it suppressed the
      // whole gate. Proven by mutation: with the catch counted, restoring the
      // original `console.error` in `external-tool test-auth` left all 16 tests
      // GREEN. A `finally` block is different and DOES follow, so it is not
      // excluded here.
      if (ts.isCatchClause(sibling)) return;
      if (emitsDocument(sibling)) found = true;
      if (ts.isReturnStatement(sibling) || ts.isThrowStatement(sibling)) terminated = true;
    });

    if (found) return true;
    if (terminated) return false;
    cursor = parent;
  }

  return false;
}

/** Walk one file's control flow, reporting every prose-then-exit pairing. */
function scanFile(
  fileName: string,
  source: ts.SourceFile,
  proseHelpers: ReadonlySet<string>,
  report: { exitSites: number; exitsThroughEmitter: number; violations: ProseRefusal[] }
): void {
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  /** The one child of a branch that ALWAYS evaluates. Its arms do not. */
  const conditionOf = (node: ts.Node): ts.Node | undefined => {
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return node.expression;
    if (ts.isConditionalExpression(node)) return node.condition;
    if (ts.isTryStatement(node)) return undefined;
    return undefined;
  };

  const isBranch = (node: ts.Node): boolean =>
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isTryStatement(node);

  const walk = (node: ts.Node, inherited: PathState): void => {
    // A function body starts a fresh path: nothing the ENCLOSING scope printed
    // has run at the time the body is DEFINED.
    const state: PathState = isFunctionLike(node)
      ? { prose: undefined, document: false }
      : { ...inherited };

    // 🚨 THE ARMS OF A BRANCH ARE NOT A SEQUENCE. Folding the THEN arm's
    // `printRecord` into the state the ELSE arm inherits marks the defect
    // compliant — and that pair IS `external-tool test-auth`, one of the two
    // findings this gate was built from.
    const branch = isBranch(node);
    const condition = branch ? conditionOf(node) : undefined;

    ts.forEachChild(node, (child) => {
      const exit = exitCodeOf(child);
      if (exit !== null) {
        report.exitSites += 1;
        if (exit.viaEmitter) {
          report.exitsThroughEmitter += 1;
        } else if (!state.document && state.prose !== undefined && !documentFollows(node)) {
          report.violations.push({
            where: `${fileName}:${lineOf(child)}`,
            detail:
              `exits ${exit.code} after \`${state.prose}(…)\` wrote prose to stderr, ` +
              `with no JSON document on stdout`
          });
        }
      }

      walk(child, state);
      if (!branch || child === condition) {
        foldSequentialCalls(child, state, proseHelpers);
      }
    });
  };

  walk(source, { prose: undefined, document: false });
}

/** Parse one source text the same way the tree is parsed. */
export function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

/**
 * Run the rule over a set of already-parsed sources.
 *
 * Exposed so the gate can run it over SYNTHETIC sources and prove the detector
 * fires — an instrument whose only evidence is its own clean result is the
 * thing this file exists to replace.
 */
export function scanSources(
  sources: readonly { readonly name: string; readonly source: ts.SourceFile }[]
): StaticScanReport {
  const proseHelpers = proseOnlyHelpers(sources);

  const report = { exitSites: 0, exitsThroughEmitter: 0, violations: [] as ProseRefusal[] };
  for (const { name, source } of sources) {
    scanFile(name, source, proseHelpers, report);
  }

  return {
    filesScanned: sources.length,
    exitSites: report.exitSites,
    exitsThroughEmitter: report.exitsThroughEmitter,
    proseHelpers: [...proseHelpers].sort(),
    violations: report.violations
  };
}

/** Run the rule over every scannable file under `root`. */
export function scanTree(root: string): StaticScanReport {
  const files = sourceFiles(root);
  if (files.length === 0) {
    throw new Error("no source files — the walk is broken, not the code");
  }
  return scanSources(
    files.map((file) => ({
      name: path.relative(root, file),
      source: parse(file, fs.readFileSync(file, "utf8"))
    }))
  );
}
