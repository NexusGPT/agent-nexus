import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * WHICH CHECK-SHAPED VERBS PRINT A VERDICT AND EXIT 0 ANYWAY — DERIVED, NOT LISTED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A VERB WHOSE WHOLE JOB IS TO ANSWER "IS THIS GOOD" MUST BE ABLE TO SAY NO WITH
 * ITS EXIT CODE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus auth status` read local config, found a key, and exited `0` — over a key
 * the API had already stopped accepting. A sweep gated its preflight on that exit
 * code, passed, and then watched 63 of 69 calls fail on auth. NEX-4209 fixed that
 * one verb.
 *
 * It is not one verb. It is a SHAPE, and the shape is what this scan measures:
 *
 *     const result = await client.skills.testExternalTool(id, body);
 *     printRecord(result);          // result.status is "success" | "error"
 *                                   // …and the process exits 0 either way
 *
 * That is `external-tool test`. Forty-five lines above it, `external-tool
 * test-auth` calls THE SAME SDK METHOD, reads THE SAME `status` field, and maps
 * the failing arm to `reportFailure`. The correct shape and the broken one sit in
 * one file, and nothing in the build could tell them apart.
 *
 * ⚠️ THE COST IS NOT "A USELESS COMMAND". IT IS A COMMAND THAT LIES TO A SCRIPT.
 * `channel setup`'s own `--help` publishes the workaround —
 * `--json | jq -e '.ready'` — which is the admission, in the product's own
 * documentation, that its exit code cannot be believed. A published workaround is
 * what this class looks like from the inside.
 *
 * ── THE TWO HALVES OF THE POPULATION, AND WHY BOTH ARE NEEDED ───────────────
 *
 * 🚨 "PRINTS A FIELD CALLED `status`" IS NOT THE CLASS, AND A SCAN BUILT ON IT
 * ALONE REPORTS EVERY `get` IN THE CLI. `agent get` prints an agent whose
 * `status` is `DRAFT | PUBLISHED`. That is an ATTRIBUTE of a record the command
 * was asked to show — the command judged nothing, so there is nothing for it to
 * exit non-zero over, and demanding one would be absurd.
 *
 * So a finding needs BOTH halves:
 *
 *   1. **the VERB declares itself a check** — its leaf name is in
 *      {@link CHECK_VERBS}. `status`, `validate`, `test`, `diagnose`, `setup`,
 *      `connection-status`, … A reader typing one of these has asked a
 *      yes/no question, and the answer is what they will branch on;
 *   2. **the ANSWER is emitted** — some sink is handed a value whose declared
 *      type carries a field in {@link VERDICT_FIELDS}.
 *
 * A leaf with both, and no exit path governed by that answer, is a finding.
 *
 * ── WHAT COUNTS AS AN EXIT PATH, AND WHY IT IS NOT "MENTIONS THE FIELD" ─────
 *
 * The first version of this scan asked whether an exit-setting call was governed
 * by a condition NAMING the verdict field. It reported `auth status` — the one
 * verb in this package that is already CURED — because that cure reads the field
 * through two derivations:
 *
 *     const probe   = options.verify ? await probeCredential(…) : null;
 *     const refusal = probe === null ? null : refusalForProbe(probe, …);
 *     if (refusal) { process.exitCode = reportFailure(…); return; }
 *     printRecord({ …, verified: probe === null ? null : true });
 *
 * The exit is governed by `refusal`; the emitted `verified` is computed from
 * `probe`; `refusal` is computed from `probe` too. Nothing in that `if` mentions
 * `verified`.
 *
 * 🚨 A GATE THAT REPORTS THE CURE IS WORSE THAN NO GATE. It makes fixing an entry
 * turn the build red, so the next person deletes the gate instead of the defect.
 * So coverage is decided by DERIVATION, not by spelling: the scan takes the
 * identifiers the verdict is computed FROM, closes that set over local variable
 * initializers, and asks whether any governing condition reads a member.
 *
 * A `throw` counts as an exit path. The action bodies here are wrapped in
 * `try/catch { process.exitCode = handleError(err) }`, so a conditional throw
 * reaches a non-zero exit — and `handleError` in that catch does NOT count on its
 * own, because it is governed by nothing and every single action has one.
 *
 * ── WHAT THIS DELIBERATELY CANNOT SEE ───────────────────────────────────────
 *
 * 🚨 SAYING SO IS THE POINT. A gate whose documentation claims completeness is
 * how a whole class reads as closed.
 *
 *   · **a check-shaped verb spelled with a word not in {@link CHECK_VERBS}.**
 *     `nexus agent try` would be invisible. The list is a JUDGEMENT about English,
 *     not a derivation, and it is the half of this scan a reader should attack
 *     first;
 *   · **a verdict on a field name not in {@link VERDICT_FIELDS}**, for the same
 *     reason;
 *   · **a verdict the SERVER sends and the SDK's type does not declare.** The
 *     population is the DECLARED type, so an undeclared field is invisible here
 *     and to every consumer of the SDK alike;
 *   · **a verdict computed inside a helper.** The emission walk resolves an
 *     identifier through its own initializer and no further, so
 *     `renderReport(result)` hides whatever it reads;
 *   · **whether an exit path is CORRECT.** This proves an exit is governed by the
 *     verdict. It cannot prove the mapping is right — that a failing verdict
 *     exits non-zero rather than the other way round. Only a reader can;
 *   · **a verdict nested one level down**, e.g. `result.summary.ok`. This reads
 *     the top level of the emitted type, and one array element type beneath it;
 *   · **a SWALLOWED error** — a `catch` that produces no exit path at all. That
 *     is the same COST (exit 0 over a bad state) reached by a different
 *     mechanism, and it is deliberately not gated here. Measured on this package
 *     on the day this file was written: **13** catch clauses inside a `.action`
 *     produce no exit, and most are correct — `try { JSON.parse(x) } catch {}`
 *     around an optional flag is not a defect. A ledger whose entries are mostly
 *     "this one is fine" is a ledger nobody reads, and then the one real entry
 *     goes past a reviewer. Reproduce the figure before quoting it; it is a
 *     `ts.isCatchClause` walk asking whether the block contains any of
 *     {@link isExitPath}'s forms.
 */

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO VOCABULARIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Leaf command names that PROMISE A VERDICT.
 *
 * Every one of these is a question a script asks in order to branch. The list is
 * deliberately conservative: a name here that turns out not to judge anything
 * costs a ledger entry saying so, while a judging name left off costs silence.
 */
export const CHECK_VERBS: ReadonlySet<string> = new Set([
  "audit",
  "beat",
  "check",
  "connection-status",
  "coverage",
  "diagnose",
  "doctor",
  "governance",
  "health",
  "lint",
  "ping",
  "poll",
  "probe",
  "ready",
  "setup",
  "status",
  "test",
  "test-auth",
  "test-node",
  "test-payload",
  "test-send",
  "validate",
  "verify",
  "whoami"
]);

/**
 * Field names that carry a VERDICT rather than an attribute.
 *
 * ⚠️ Membership here is not enough on its own — see {@link isVerdictShaped}. The
 * value has to be something a shell can branch on: a boolean, a string, or a list
 * of problems. A `status` that is an HTTP number is not.
 */
export const VERDICT_FIELDS: ReadonlySet<string> = new Set([
  "conflicts",
  "connected",
  "errors",
  "failed",
  "healthy",
  "isConnected",
  "isHealthy",
  "isReady",
  "isValid",
  "issues",
  "live",
  "ok",
  "outcome",
  "passed",
  "problems",
  "reachable",
  "ready",
  "status",
  "success",
  "valid",
  "verdict",
  "verified",
  "warnings"
]);

// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING
// ─────────────────────────────────────────────────────────────────────────────

/** One check-shaped leaf that emits a verdict field with no exit path from it. */
export interface VerdictWithoutExit {
  /** Path relative to `src/`, e.g. `commands/external-tool.ts`. */
  readonly file: string;
  /** The commander object the leaf hangs off, e.g. `externalTool`. */
  readonly receiver: string;
  /** The leaf command name, e.g. `test`. */
  readonly command: string;
  /** 1-based line of the `.action(...)` call. */
  readonly line: number;
  /** The verdict field emitted with no exit path. */
  readonly field: string;
}

/** `commands/external-tool.ts externalTool.test status` — stable across edits above it. */
export function verdictKey(finding: {
  readonly file: string;
  readonly receiver: string;
  readonly command: string;
  readonly field: string;
}): string {
  return `${finding.file} ${finding.receiver}.${finding.command} ${finding.field}`;
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
    if (entry.name.endsWith(".d.ts")) return [];
    return [full];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHAPE TESTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is this type BRANCHABLE — something a caller can act on?
 *
 * A boolean is. A string is, literal union or not. An array is: an empty
 * `errors` is the pass and a non-empty one is the fail.
 *
 * A number and an object are NOT. That rules out a `status` that is an HTTP code
 * and an `outcome` that is a nested report — neither is a value a shell can
 * branch on without first knowing a second thing.
 *
 * ⚠️ THIS TEST IS DELIBERATELY NOT "IS IT A CLOSED UNION". The first version
 * demanded a string-LITERAL union, on the reasoning that a bare `string` is a
 * label rather than an answer. It dropped FOUR real findings —
 * `execution diagnose`, `workflow test-node`, `workflow node test` and
 * `workspace status` — because the SDK declares those fields as plain `string`,
 * and because an object literal built at the call site widens `"yes" | "no"` to
 * `string` before any scan can read it. The narrowing that keeps `agent get` out
 * of this population is {@link CHECK_VERBS}, which is a fact about the VERB. It
 * does not need a second, weaker copy of itself here.
 */
export function isVerdictShaped(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = type.isUnion() ? type.types : [type];
  let sawAnswer = false;

  for (const part of parts) {
    // `undefined` and `null` are how an optional verdict is spelled. They neither
    // qualify a type nor disqualify it.
    if (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
    if (part.flags & ts.TypeFlags.BooleanLike) {
      sawAnswer = true;
      continue;
    }
    if (part.flags & ts.TypeFlags.StringLike) {
      sawAnswer = true;
      continue;
    }
    // An array of problems: `errors: string[]`, `issues: Issue[]`.
    if (checker.isArrayType(part) || checker.isTupleType(part)) {
      sawAnswer = true;
      continue;
    }
    return false;
  }

  return sawAnswer;
}

/** Peel the wrappers a payload is written behind, so its real type is reachable. */
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
    // `JSON.stringify(x, null, 2)` — the document is `x`. `workspace status` and
    // `execution diagnose` both emit their `--json` document this way, below
    // every printer in this package.
    if (
      ts.isCallExpression(cursor) &&
      cursor.expression.getText() === "JSON.stringify" &&
      cursor.arguments.length > 0
    ) {
      cursor = cursor.arguments[0];
      continue;
    }
    return cursor;
  }
}

/** Is this call a place bytes leave the process? */
function sinkName(call: ts.CallExpression, source: ts.SourceFile): string | null {
  if (ts.isIdentifier(call.expression)) {
    // Every printer in `output.ts` is `print*`, and a command-local renderer
    // follows the same convention — `printVibeCluster` is one, and keying on the
    // exact export list would have missed it.
    const name = call.expression.text;
    if (name.startsWith("print") || name === "emitDocument") return name;
    return null;
  }
  if (ts.isPropertyAccessExpression(call.expression)) {
    const text = call.expression.getText(source).replace(/\s+/g, "");
    if (text === "console.log" || text === "process.stdout.write") return text;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE WALK
// ─────────────────────────────────────────────────────────────────────────────

/** The leaf command a `.action(...)` belongs to, read off its own call chain. */
function leafOf(
  action: ts.CallExpression,
  source: ts.SourceFile
): { receiver: string; command: string } | null {
  if (!ts.isPropertyAccessExpression(action.expression)) return null;
  if (action.expression.name.text !== "action") return null;

  let cursor: ts.Expression = action.expression.expression;
  for (;;) {
    if (ts.isCallExpression(cursor) && ts.isPropertyAccessExpression(cursor.expression)) {
      if (
        cursor.expression.name.text === "command" &&
        cursor.arguments.length > 0 &&
        ts.isStringLiteralLike(cursor.arguments[0])
      ) {
        return {
          // The receiver disambiguates two leaves of the same name in one file —
          // `workflow test` and `node test` both live in the workflow tree.
          receiver: cursor.expression.expression.getText(source).replace(/\s+/g, " "),
          command: (cursor.arguments[0] as ts.StringLiteralLike).text
        };
      }
      cursor = cursor.expression.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    return null;
  }
}

/** Every identifier name appearing anywhere in an expression. */
function identifiersIn(node: ts.Node): Set<string> {
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
function derivationEdges(body: ts.Node): Map<string, Set<string>> {
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
function closure(seeds: Iterable<string>, edges: Map<string, Set<string>>): Set<string> {
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

/** The conditions that govern whether `node` runs, up to `stop`. */
function governingConditions(node: ts.Node, stop: ts.Node): ts.Expression[] {
  const conditions: ts.Expression[] = [];
  let child: ts.Node = node;
  let cursor: ts.Node | undefined = node.parent;

  while (cursor !== undefined && cursor !== stop) {
    if (ts.isIfStatement(cursor)) conditions.push(cursor.expression);
    if (ts.isConditionalExpression(cursor)) conditions.push(cursor.condition);
    if (ts.isSwitchStatement(cursor)) conditions.push(cursor.expression);
    if (ts.isCaseClause(cursor)) conditions.push(cursor.expression);
    if (
      ts.isBinaryExpression(cursor) &&
      (cursor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        cursor.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        cursor.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      cursor.right === child
    ) {
      conditions.push(cursor.left);
    }
    child = cursor;
    cursor = cursor.parent;
  }

  return conditions;
}

/**
 * Is this node a path that ends non-zero — or can?
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 🚨 CALLING `reportFailure(…)` IS NOT EXITING. THE ASSIGNMENT IS.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `refuse`, `reportFailure` and `printNotFound` PRINT the error document and
 * RETURN a code; `printFailure` returns `void` and has, in its own words, "NO
 * opinion about the exit code". None of the four touches `process.exitCode`. The
 * caller does — `process.exitCode = reportFailure(…)` — and every correct site in
 * this package is written that way.
 *
 * An earlier version of this file listed those helper NAMES as exit paths. That
 * blessed the exact defect one layer in: a check verb that reads a failing
 * verdict and calls `reportFailure(…)` as a bare statement prints a perfect error
 * document and still exits `0`, and the scan would have called that field
 * covered. Found by review, not by any mutation — mine all mutated the
 * ASSIGNMENT, which is the form that was already right.
 *
 * So the three forms below are the whole list, and each genuinely ends the
 * process non-zero:
 *
 *   · `process.exitCode = …` — whatever the right-hand side is;
 *   · `process.exit(…)`;
 *   · a `throw`, which the action's own `catch` maps through `handleError`.
 *
 * ⚠️ Every action in this package ends with
 * `catch (err) { process.exitCode = handleError(err) }`, which IS an exit path by
 * this test. It is excluded by the OTHER half of the rule: it is governed by no
 * condition, so it says nothing about the verdict. Counting an ungoverned exit
 * would make every leaf covered and the scan would report nothing, forever.
 */
function isExitPath(node: ts.Node, source: ts.SourceFile): boolean {
  if (ts.isThrowStatement(node)) return true;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.left.getText(source).replace(/\s+/g, "") === "process.exitCode"
  ) {
    return true;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source).replace(/\s+/g, "") === "process.exit"
  ) {
    return true;
  }
  return false;
}

/**
 * Every check-shaped leaf that emits a verdict with no exit path governed by it.
 *
 * `root` defaults to this package's `src/`; a test hands it a fixture tree, which
 * is how the detector itself is proven rather than assumed.
 */
export function scanVerdictsWithoutExit(root = defaultScanRoot()): VerdictWithoutExit[] {
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
  const found: VerdictWithoutExit[] = [];

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);
      if (!ts.isCallExpression(node)) return;

      const leaf = leafOf(node, source);
      if (leaf === null) return;
      if (!CHECK_VERBS.has(leaf.command)) return;

      const body = node.arguments[0];
      if (body === undefined) return;

      // ── what verdict does this leaf emit, and what is it computed from? ──
      const sources = new Map<string, Set<string>>();

      const collectEmissions = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && sinkName(n, source) !== null) {
          for (const rawArgument of n.arguments) {
            const argument = unwrap(rawArgument);
            let type = checker.getTypeAtLocation(argument);
            // A table is handed the ROWS; the verdict is on the row.
            const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
            if (element !== undefined) type = element;

            for (const symbol of type.getProperties()) {
              const name = symbol.getName();
              if (!VERDICT_FIELDS.has(name)) continue;
              const propertyType = checker.getTypeOfSymbolAtLocation(symbol, argument);
              if (!isVerdictShaped(propertyType, checker)) continue;

              // What is this verdict computed FROM? For a literal built at the
              // call site, the property's own initializer; otherwise the payload
              // expression itself. `channel setup` is the first case
              // (`{ ready: data.ready }`), `external-tool test` the second.
              const declaration = symbol.valueDeclaration;
              const seeds =
                declaration !== undefined &&
                ts.isPropertyAssignment(declaration) &&
                declaration.getSourceFile() === source
                  ? identifiersIn(declaration.initializer)
                  : identifiersIn(argument);

              const existing = sources.get(name) ?? new Set<string>();
              for (const seed of seeds) existing.add(seed);
              // The field name itself is a seed: `switch (result.status)` reads it
              // by name, and a shorthand `{ status }` carries no other identifier.
              existing.add(name);
              sources.set(name, existing);
            }
          }
        }
        ts.forEachChild(n, collectEmissions);
      };
      collectEmissions(body);
      if (sources.size === 0) return;

      // ── which of them govern an exit path? ──────────────────────────────
      const edges = derivationEdges(body);
      const covered = new Set<string>();

      const collectExits = (n: ts.Node): void => {
        if (isExitPath(n, source)) {
          const conditions = governingConditions(n, body);
          if (conditions.length > 0) {
            const read = new Set<string>();
            for (const condition of conditions) {
              for (const name of identifiersIn(condition)) read.add(name);
            }
            for (const [field, seeds] of sources) {
              const reachable = closure(seeds, edges);
              for (const name of read) {
                if (reachable.has(name)) covered.add(field);
              }
            }
          }
        }
        ts.forEachChild(n, collectExits);
      };
      collectExits(body);

      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const field of [...sources.keys()].sort()) {
        if (covered.has(field)) continue;
        found.push({
          file: path.relative(root, source.fileName).replace(/\\/g, "/"),
          receiver: leaf.receiver,
          command: leaf.command,
          line,
          field
        });
      }
    };

    visit(source);
  }

  return found.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.field.localeCompare(right.field)
  );
}

/**
 * Every check-shaped leaf this scan LOOKED AT, whatever the verdict.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE ANTI-VACUITY SURFACE, AND IT IS DELIBERATELY NOT THE FINDINGS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The findings DRAIN — that is the whole point of the ledger beside this file —
 * so a control asserting "the scan found something" dies the day the last entry
 * is fixed, and takes the gate with it. A CURED leaf still emits its verdict; it
 * simply also exits over it. So the population below is stable under draining and
 * a zero here means the walk broke, never that the tree got clean.
 */
export function scanCheckVerbEmissions(root = defaultScanRoot()): string[] {
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
  const emissions = new Set<string>();

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);
      if (!ts.isCallExpression(node)) return;
      const leaf = leafOf(node, source);
      if (leaf === null || !CHECK_VERBS.has(leaf.command)) return;
      const body = node.arguments[0];
      if (body === undefined) return;

      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && sinkName(n, source) !== null) {
          for (const rawArgument of n.arguments) {
            const argument = unwrap(rawArgument);
            let type = checker.getTypeAtLocation(argument);
            const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
            if (element !== undefined) type = element;
            for (const symbol of type.getProperties()) {
              const name = symbol.getName();
              if (!VERDICT_FIELDS.has(name)) continue;
              if (!isVerdictShaped(checker.getTypeOfSymbolAtLocation(symbol, argument), checker)) {
                continue;
              }
              emissions.add(
                verdictKey({
                  file: path.relative(root, source.fileName).replace(/\\/g, "/"),
                  receiver: leaf.receiver,
                  command: leaf.command,
                  field: name
                })
              );
            }
          }
        }
        ts.forEachChild(n, walk);
      };
      walk(body);
    };

    visit(source);
  }

  return [...emissions].sort();
}
