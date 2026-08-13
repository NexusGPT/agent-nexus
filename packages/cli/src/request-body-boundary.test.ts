import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Operator JSON reaches a typed SDK argument through `asRequestBody`, or not at all.
 *
 * `--body` accepts arbitrary JSON, so what a command holds is
 * `Record<string, unknown>` and nothing in the CLI narrows it — the reasoning is
 * written out on `asRequestBody` itself in `src/util/body.ts`. The assertion is
 * unavoidable; what is avoidable is it happening ANONYMOUSLY, so that "where does
 * unvalidated operator input cross into typed code?" has a single answer.
 *
 * The reason this needs a gate rather than a convention is that the unsanctioned
 * form is INVISIBLE. Every request-body interface in the SDK is all-optional, and
 * `Record<string, unknown>` is assignable to an all-optional interface: the source
 * declares no conflicting property, and its index signature suppresses TypeScript's
 * weak-type check. So `client.deploymentFolders.update(id, body)` compiled, checked
 * nothing, and carried no cast for any census to count. A `grep` for `as any` cannot
 * see a crossing that never needed a cast.
 *
 * Three things are therefore checked, over the real `src/` tree:
 *
 *  1. an operator-JSON value handed to an SDK method must be wrapped — however it
 *     reaches the argument: inlined, bound to a local, renamed through a chain of
 *     locals, spread into an object literal, or passed to a client the file
 *     destructured rather than named;
 *  2. an assertion must not widen to `any`, and must not launder a value through
 *     `unknown` into a concrete type — in EITHER spelling (`x as T` and `<T>x`),
 *     whether the launder is written on one line or spread across two statements;
 *  3. a shape that widens a type with NO assertion node at all — a module
 *     augmentation, a `declare global`, a `@ts-expect-error` — needs an entry in
 *     `UNGATED_WITH_REASON`, because it is the cheapest way past (1) and (2) and
 *     its blast radius is the whole package rather than one call site.
 *
 * (2) exists because (1) is evadable by one keystroke: a double assertion at the
 * DECLARATION makes the identifier reach the call already typed, which is the exact
 * shape `asRequestBody` replaced. (3) exists because (2) is evadable by writing no
 * assertion: `declare module "commander" { interface Command { _hidden?: boolean } }`
 * makes a private field a legitimate optional in every file that imports commander,
 * and there is no cast anywhere for a cast scan to count.
 *
 * ── WHAT THIS GATE DOES NOT SEE ──────────────────────────────────────────────
 *
 * A gate that names its own holes is worth more than one implying completeness.
 * It parses with `ts.createSourceFile` — a SYNTAX tree, no `ts.Program` and no
 * type checker — so everything below is out of reach by construction, not by
 * omission. Each was inserted into a real `src/` file and watched pass.
 *
 *  - **`any` in a TYPE ANNOTATION.** `function f(x: any)`, `{ v?: any }`, `let
 *    x: any`. Widening a signature is the standard cure for a red cast gate: the
 *    cast count improves and the hole grows. This is a MEASURED hole, and the
 *    measurement is a command rather than a number:
 *
 *        git grep -nE '\w: any\b' -- packages/cli/src ':!*.test.ts' ':!*.generated.ts' \
 *          | grep -vE ':[0-9]+: *(//|\*)'
 *
 *    The second stage drops prose — a comment reading "the command: any failure"
 *    matches the first. What survives is the live set. NO LINE NUMBER AND NO
 *    COUNT IS WRITTEN HERE, deliberately: both are stale the moment another lane
 *    reformats a file or fixes a site, and a citation that resolves to the wrong
 *    line reads as precise while being uncheckable — which is worse than no
 *    citation, because the whole claim of this section is that its holes are
 *    checkable. An empty result means the hole is closed.
 *
 *    The live sites are `find`/`map` callback parameters in `commands/channel.ts`
 *    — under `channel whatsapp-template create`, `... approvals` and
 *    `... submit-approval` — each typing a callback over a template approval the
 *    SDK returns loosely. Not closed: they are owned by another lane, and a rule
 *    that reds on correct work is a rule that gets deleted. An ASSERTION to a
 *    type that merely CONTAINS `any` (`as any[]`, `as Record<string, any>`) IS
 *    caught — the command above is also the evidence that costs nothing, since
 *    every match it returns is an annotation and none is an assertion.
 *  - **A cast laundered through a generic function's return type.**
 *    `function launder<T>(x: unknown): T { return x as T }` — the call site
 *    `launder<Secret>(junk)` carries no assertion. Structurally unclosable here:
 *    `asRequestBody` IS that shape, so any rule broad enough to catch the abuse
 *    catches the sanctioned helper.
 *  - **A non-null assertion over an `any`-typed member.** `x.v!`, where `x.v` is
 *    declared `any`, reaches a typed slot with no cast. Same root as the first
 *    bullet — the `any` is in the declaration, and the declaration is where this
 *    gate stops looking. The WRAPPER is not the hole: `peel` knows
 *    `ts.NonNullExpression`, so `client.folders.update(id, body!)` is reported
 *    like any other unwrapped crossing.
 *  - **Anything a type checker would infer.** An `any` arriving from an untyped
 *    dependency propagates through this tree invisibly.
 *  - **A body that crosses a FUNCTION boundary.** `send(id, body)`, where `send`
 *    holds the client, is dataflow between two functions; every resolver here
 *    stops at the nearest binding in the enclosing scope.
 *  - **A client held on `this`.** `this.api.folders.update(id, body)` — the chain
 *    is rooted at a `this` expression, which is no identifier to bind. Not closed
 *    because the hand-written tree holds no class that owns a client (the only
 *    classes in `src/` are `Error` subclasses and `SseDecoder`), so the rule would
 *    be surface nothing exercises — and an untested branch in a gate is how a gate
 *    starts refusing correct work.
 *  - **`*.test.ts`, `*.generated.ts`, and every file outside `src/`.** Excluded by
 *    `handWrittenSources`, deliberately, for the reasons written on it.
 */

/** The helpers that produce operator-supplied JSON. `src/util/body.ts`. */
const OPERATOR_JSON_SOURCES = ["resolveBody", "resolveRequiredBody", "mergeBodyWithFlags"];

/** The one sanctioned way for that JSON to become a typed SDK argument. */
const AS_REQUEST_BODY = "asRequestBody";

/**
 * The exceptions, each with the reason it is not simply fixed.
 *
 * Matched on NORMALISED SOURCE TEXT, never on a line number: an entry that is
 * edited stops matching and the exception lapses, which is the property a
 * line-keyed list does not have. Every entry is asserted to still occur, so the
 * list cannot rot into a blanket permission.
 */
const UNGATED_WITH_REASON: readonly { file: string; code: string; reason: string }[] = [
  {
    file: "util/body.ts",
    code: "body as unknown as T",
    reason:
      "This IS the boundary. `asRequestBody` is the one place the assertion is made, " +
      "and every other site in this package exists to route through it."
  },
  {
    file: "config.ts",
    code: "parsed as unknown as NexusConfigV2",
    reason:
      "A config file on disk, not a request body. Narrowing it honestly means validating " +
      "the whole profiles map, which changes what a malformed ~/.nexusrc does — a behaviour " +
      "change, not a typing one. The CLI cannot import Zod (see `asRequestBody`'s docblock)."
  },
  {
    file: "commands/workflow-builder.ts",
    code: "mergeBodyWithFlags(extra, { type: triggerType }) as unknown as ReplaceTriggerBody",
    reason:
      "Open PR #2583 rewrites this file and the workflow wire types it asserts against. " +
      "Two PRs editing it have already conflicted three times."
  },
  {
    file: "commands/workflow-builder.ts",
    code: "client.workflows.replaceTrigger(wfId, body)",
    reason: "Same file, same open PR #2583. It is the call site of the assertion above."
  },
  {
    file: "commands/workflow.ts",
    code: "(await client.workflows.testWorkflow(id, body)) as unknown as Record< string, unknown >",
    reason:
      "A RESPONSE, widened so a `status` column can be read off it. The service returns " +
      "`{ executionId, status: 'RUNNING' }` from both arms while the SDK's `TestResult` " +
      "declares only `executionId` — so removing this widening deletes a column that is " +
      "real. The fix belongs in `packages/sdk/src/types/workflows.ts`, which open PR #2583 owns."
  }
];

// ---------------------------------------------------------------------------
// The detectors. Both take a parsed source file and return findings, so the
// self-test below can drive them with synthetic sources — a gate whose only
// input is the tree it guards cannot be shown to fail.
// ---------------------------------------------------------------------------

interface Finding {
  file: string;
  line: number;
  code: string;
}

/** Collapse whitespace so a finding survives reformatting and matches an entry. */
function normalise(code: string): string {
  return code.replace(/\s+/g, " ").trim();
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

function finding(file: string, sf: ts.SourceFile, node: ts.Node): Finding {
  return { file, line: lineOf(sf, node), code: normalise(node.getText(sf)) };
}

const isScopeNode = (n: ts.Node): boolean =>
  ts.isSourceFile(n) ||
  ts.isBlock(n) ||
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/**
 * The nearest binding of `name`, or null.
 *
 * Scope-aware on purpose. A file-wide name lookup reported `workflow test` and
 * `workflow test-node` as unwrapped crossings because a DIFFERENT action in the
 * same file binds `body` to `mergeBodyWithFlags`; both actually build their body
 * through a typed helper. Two false positives in a gate this size is how an
 * allowlist starts absorbing things that are fine.
 */
/** Does this declaration bind `name` — plainly, or out of a destructuring pattern? */
function declares(decl: ts.VariableDeclaration, name: string): boolean {
  if (ts.isIdentifier(decl.name)) return decl.name.text === name;
  // `const { folders } = createClient(o)` binds `folders`, and a walk that only
  // knows plain identifiers reports `folders.update(...)` as reaching no SDK.
  if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
    return decl.name.elements.some(
      (el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name
    );
  }
  return false;
}

function nearestBinding(node: ts.Node, name: string): ts.VariableDeclaration | null {
  for (let scope: ts.Node | undefined = node.parent; scope; scope = scope.parent) {
    if (!isScopeNode(scope)) continue;
    let found: ts.VariableDeclaration | null = null;
    const scan = (n: ts.Node): void => {
      if (found !== null) return;
      if (ts.isVariableDeclaration(n) && declares(n, name)) {
        found = n;
        return;
      }
      // Never descend into a nested function: its bindings are not in scope here.
      if (n !== scope && isScopeNode(n) && !ts.isBlock(n)) return;
      ts.forEachChild(n, scan);
    };
    scan(scope);
    if (found !== null) return found;
  }
  return null;
}

/** The initializer of the nearest binding of `name`, or null. */
function nearestBindingInit(node: ts.Node, name: string): ts.Expression | null {
  return nearestBinding(node, name)?.initializer ?? null;
}

/**
 * BOTH spellings of an assertion, as one predicate.
 *
 * `x as T` is `ts.AsExpression`; `<T>x` is `ts.TypeAssertion` — a different node
 * kind carrying the same meaning. A walk that knows only the first is defeated by
 * an angle bracket, in the crossing scan and in the ban alike, and TypeScript
 * emits no diagnostic to notice the difference by. Anywhere one is handled, the
 * other must be.
 */
type Assertion = ts.AsExpression | ts.TypeAssertion;
const isAssertion = (n: ts.Node): n is Assertion =>
  ts.isAsExpression(n) || ts.isTypeAssertionExpression(n);

/** The two types an assertion can widen TO rather than narrow to. */
const WIDE = new Set<ts.SyntaxKind>([ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword]);

/** Does this type mention `any` — as itself, or inside `any[]` / `Record<string, any>`? */
function mentionsAny(type: ts.TypeNode): boolean {
  let hit = false;
  const walk = (n: ts.Node): void => {
    if (n.kind === ts.SyntaxKind.AnyKeyword) hit = true;
    if (!hit) ts.forEachChild(n, walk);
  };
  walk(type);
  return hit;
}

/**
 * Strip every wrapper an argument can reach a call site through.
 *
 * `await x`, `(x)`, `x as T`, `<T>x`, `x satisfies T`, `x!` and `x ?? {}` —
 * repeatedly, and in any order, because they compose: `(await resolveBody(o)) ?? {}`
 * is three of them. One shared peel is what stops a wrapper being handled in one
 * classifier and not the next, and every one of these is a single keystroke away
 * from an argument that would otherwise be reported.
 */
function peel(expr: ts.Expression): ts.Expression {
  let e: ts.Expression = expr;
  for (;;) {
    if (
      ts.isAwaitExpression(e) ||
      ts.isParenthesizedExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      isAssertion(e)
    ) {
      e = e.expression;
    } else if (
      ts.isBinaryExpression(e) &&
      e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      e = e.left;
    } else {
      return e;
    }
  }
}

/**
 * Peel only what can sit BETWEEN an assertion and the value it asserts.
 *
 * Narrower than `peel` on purpose: `(x as unknown) as T` and
 * `x as unknown satisfies unknown as T` are the same double assertion as
 * `x as unknown as T`, and one pair of brackets is the whole evasion. Stopping at
 * an assertion is what lets the caller ask whether the inner one widened.
 */
function peelToAssertedValue(expr: ts.Expression): ts.Expression {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/**
 * Does this declaration DISCARD a type the value already had?
 *
 * `const u: unknown = x` is `x as unknown` written as a statement — the value
 * arrived typed and the annotation is the only thing widening it. Assert `u` to a
 * concrete type on the next line and you have the banned double assertion, spread
 * over two statements, with no node for the ban to match.
 *
 * Three shapes are deliberately NOT this, and all three are live in `src/` today:
 *
 *  - `catch (err: unknown)` — TypeScript widens it, no author did, and there is no
 *    other spelling. It has no initializer, which is what excludes it here.
 *  - `let parsed: unknown;` assigned later — same, and the source is a wide value.
 *  - `const parsed: unknown = JSON.parse(text)` — `JSON.parse` returns `any`, so
 *    the annotation NARROWS it. Refusing that spelling pushes the fix towards
 *    `any`, which is the opposite of the point.
 *
 * So the rule is the initializer: a plain identifier or property/element read was
 * already typed; a call was not.
 */
function laundersThroughWideDeclaration(decl: ts.VariableDeclaration | null): boolean {
  if (decl === null || decl.type === undefined || !WIDE.has(decl.type.kind)) return false;
  if (decl.initializer === undefined) return false;
  const init = peelToAssertedValue(decl.initializer);
  return (
    ts.isIdentifier(init) ||
    ts.isPropertyAccessExpression(init) ||
    ts.isElementAccessExpression(init)
  );
}

/**
 * Is this expression operator-supplied JSON — a DIRECT call to one of the helpers?
 *
 * Direct, not "mentions one somewhere". `buildTestWorkflowBody(await resolveBody(x))`
 * contains `resolveBody(` and is not operator JSON: it is the typed normaliser whose
 * whole job is to turn that value into the shape the endpoint declares. A substring
 * test flags it, and a flagged helper is how a gate teaches people to stop writing
 * typed helpers.
 */
function isOperatorJson(expr: ts.Expression): boolean {
  const e = peel(expr);
  return (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    OPERATOR_JSON_SOURCES.includes(e.expression.text)
  );
}

/**
 * Does this expression carry operator JSON — directly, through a chain of local
 * aliases, or spread into an object literal?
 *
 * `const payload = body` is one rename, and a lookup that resolves exactly one hop
 * stops at `body` — an identifier, not a call — and reports the crossing clean.
 * `{ ...body }` is the same value in an object literal, which is no identifier and
 * no call, so both classifiers skip it. The depth bound is what stops `const a = a`
 * spinning; six is far past anything a command module writes.
 */
function carriesOperatorJson(expr: ts.Expression, depth = 6): boolean {
  const e = peel(expr);

  if (isOperatorJson(e)) return true;

  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.some(
      (p) => ts.isSpreadAssignment(p) && carriesOperatorJson(p.expression, depth - 1)
    );
  }

  if (depth > 0 && ts.isIdentifier(e)) {
    const bound = nearestBindingInit(e, e.text);
    return bound !== null && carriesOperatorJson(bound, depth - 1);
  }

  return false;
}

/** The identifier a property-access chain is rooted at (`client.a.b` -> `client`). */
function chainRoot(expr: ts.Expression): ts.Identifier | null {
  let e: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(e)) e = e.expression;
  return ts.isIdentifier(e) ? e : null;
}

/**
 * Is this call reaching the SDK?
 *
 * Two ways, deliberately a union rather than the second alone. Matching the NAME
 * `client` is what the whole package writes today, and it keeps working inside a
 * helper that receives the client as a parameter (`util/run-follow.ts`). Matching a
 * binding to `createClient(...)` is what stops the gate being defeated by naming the
 * local `api` — which is exactly how a name-coupled walk goes quietly blind.
 */
function isSdkCall(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  const root = chainRoot(call.expression);
  if (root === null) return false;
  if (root.text === "client") return true;
  const bound = nearestBindingInit(root, root.text);
  return (
    bound !== null &&
    ts.isCallExpression(bound) &&
    ts.isIdentifier(bound.expression) &&
    bound.expression.text === "createClient"
  );
}

interface CrossingScan {
  unwrapped: Finding[];
  /** SDK calls seen, and args wrapped in `asRequestBody` — the floors below. */
  sdkCalls: number;
  wrapped: number;
  /** A wrapped arg with no explicit type argument would infer `unknown`. */
  untyped: Finding[];
}

function scanCrossings(file: string, sf: ts.SourceFile): CrossingScan {
  const out: CrossingScan = { unwrapped: [], sdkCalls: 0, wrapped: 0, untyped: [] };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && isSdkCall(n)) {
      out.sdkCalls++;
      for (const arg of n.arguments) {
        // Peel FIRST, and peel everything, before anything is classified.
        // Ordering the checks the other way round is what let
        // `mergeBodyWithFlags(...) ?? {}` through: the inlined-call test ran on
        // the unpeeled `??` node and said no, and the identifier test then ran
        // on the peeled left operand — a call, not an identifier — and skipped.
        // Each check was correct about the node it saw, and the argument was
        // seen by neither.
        const inner = peel(arg);

        if (
          ts.isCallExpression(inner) &&
          ts.isIdentifier(inner.expression) &&
          inner.expression.text === AS_REQUEST_BODY
        ) {
          out.wrapped++;
          if (!inner.typeArguments || inner.typeArguments.length === 0) {
            out.untyped.push(finding(file, sf, inner));
          }
          continue;
        }

        // Inlined at the call, bound to a local, aliased through several locals,
        // or spread into an object literal — one resolver for all four.
        if (carriesOperatorJson(inner)) out.unwrapped.push(finding(file, sf, n));
      }
    }
    ts.forEachChild(n, visit);
  };

  visit(sf);
  return out;
}

/**
 * An assertion that widens to `any`, or launders a value through `unknown`.
 *
 * Both spellings, and all three shapes of the launder — one line, bracketed, and
 * split across two statements. A single narrowing assertion (`opts.type as
 * Trigger["type"]`) is left alone: `opts` is untyped commander input, and banning
 * that pushes the fix towards widening the target instead.
 */
function scanBannedAssertions(file: string, sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (isAssertion(n)) {
      const inner = peelToAssertedValue(n.expression);
      const widensToAny = mentionsAny(n.type);
      const isDouble = isAssertion(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword;
      const isSplitDouble =
        !WIDE.has(n.type.kind) &&
        ts.isIdentifier(inner) &&
        laundersThroughWideDeclaration(nearestBinding(inner, inner.text));
      // Report the OUTER node of a double assertion, so the finding reads as the
      // whole `x as unknown as T` rather than as a bare `x as unknown`.
      if (widensToAny || isDouble || isSplitDouble) out.push(finding(file, sf, n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The comment forms that switch the type checker off for the line below. */
const SUPPRESSIONS = /@ts-(expect-error|ignore|nocheck)/g;

/**
 * Widenings that leave NO assertion node behind — the cheapest way past the scan
 * above, and the one with the largest blast radius.
 *
 * A module augmentation edits a type the package does not own, for every file that
 * imports it: `declare module "commander" { interface Command { _hidden?: boolean } }`
 * turns a private field into a legitimate optional package-wide, and no cast
 * exists anywhere for any census to find. `declare global` is the same act against
 * the global scope. A `@ts-expect-error` is the same act against one line.
 *
 * These are REQUIRED TO BE DECLARED rather than banned outright. An augmentation is
 * the legitimate mechanism for typing a genuine third-party gap, and a rule with no
 * legal path pushes the next author to `as any`, which is strictly worse and which
 * this file would then have to allowlist anyway. Refusing only the members whose
 * NAME marks them private — a leading underscore — would be defeated by renaming
 * the member, and name-coupling is the failure `isSdkCall` already documents.
 *
 * The finding is the HEADER, not the block: a whole augmentation body as the
 * allowlist key would relapse the moment anyone reformatted it.
 */
function scanUndeclaredWidenings(file: string, sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];

  const visit = (n: ts.Node): void => {
    if (ts.isModuleDeclaration(n)) {
      if (ts.isStringLiteral(n.name)) {
        out.push({ file, line: lineOf(sf, n), code: `declare module ${n.name.getText(sf)}` });
      } else if ((n.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
        out.push({ file, line: lineOf(sf, n), code: "declare global" });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // Comments are trivia, so they are not in the tree. Read them off the text.
  for (const match of sf.text.matchAll(SUPPRESSIONS)) {
    const at = match.index ?? 0;
    const eol = sf.text.indexOf("\n", at);
    out.push({
      file,
      line: sf.getLineAndCharacterOfPosition(at).line + 1,
      code: normalise(sf.text.slice(at, eol === -1 ? sf.text.length : eol))
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// The tree.
// ---------------------------------------------------------------------------

/**
 * Every hand-written `.ts` under `src/`, relative to it.
 *
 * `*.generated.ts` is excluded because it is written by `scripts/bundle-skills.ts`
 * and must never be hand-edited; `*.test.ts` because a spec's stub client is a
 * legitimate place to assert a shape into existence.
 */
function handWrittenSources(dir = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...handWrittenSources(full));
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".generated.ts")
    ) {
      out.push(relative(SRC_DIR, full));
    }
  }
  return out;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
}

const FILES = handWrittenSources();
const PARSED = FILES.map((file) => ({
  file,
  sf: parse(file, readFileSync(join(SRC_DIR, file), "utf-8"))
}));

const CROSSINGS = PARSED.map(({ file, sf }) => scanCrossings(file, sf));
const UNWRAPPED = CROSSINGS.flatMap((c) => c.unwrapped);
const UNTYPED = CROSSINGS.flatMap((c) => c.untyped);
const SDK_CALLS = CROSSINGS.reduce((n, c) => n + c.sdkCalls, 0);
const WRAPPED = CROSSINGS.reduce((n, c) => n + c.wrapped, 0);
const BANNED = PARSED.flatMap(({ file, sf }) => scanBannedAssertions(file, sf));
const WIDENINGS = PARSED.flatMap(({ file, sf }) => scanUndeclaredWidenings(file, sf));

const allowed = (f: Finding): boolean =>
  UNGATED_WITH_REASON.some((e) => e.file === f.file && normalise(e.code) === f.code);

const describeFinding = (f: Finding): string => `${f.file}:${f.line}  ${f.code}`;

describe("operator JSON crosses into a typed SDK argument only through asRequestBody", () => {
  it("walked the tree, and found the sanctioned form in it", () => {
    // Guards the gate. A moved `src/`, a renamed helper, or a walk that throws
    // would otherwise scan nothing, and every assertion below is VACUOUSLY TRUE
    // over an empty set — indistinguishable from a clean pass.
    //
    // The floors are deliberately well under the counts measured when this was
    // written (54 command modules, 313 SDK calls, 77 wrapped arguments), so a
    // command being deleted does not turn the gate red for the wrong reason.
    expect(FILES.length).toBeGreaterThan(40);
    expect(SDK_CALLS).toBeGreaterThan(200);
    expect(WRAPPED).toBeGreaterThan(60);
  });

  it("hands no operator-JSON value to an SDK method unwrapped", () => {
    const offenders = UNWRAPPED.filter((f) => !allowed(f)).map(describeFinding);
    expect(
      offenders,
      "wrap the argument in asRequestBody<TheSdkBodyType>(...) — it compiles either way, " +
        "which is the problem"
    ).toEqual([]);
  });

  it("names the SDK type at every wrapped call", () => {
    // `asRequestBody(body)` with no type argument infers `T = unknown`, which the
    // SDK parameter then rejects — but only where the parameter is not itself
    // loose. Requiring the type argument makes the call site say what it sends.
    expect(UNTYPED.map(describeFinding)).toEqual([]);
  });

  it("contains no `as any` and no `as unknown as T`", () => {
    const offenders = BANNED.filter((f) => !allowed(f)).map(describeFinding);
    expect(
      offenders,
      "an assertion at the declaration reaches the call already typed, which is the shape " +
        "asRequestBody replaced — fix the contract, or add an entry with a reason"
    ).toEqual([]);
  });

  it("widens no type without an assertion for the scan above to find", () => {
    const offenders = WIDENINGS.filter((f) => !allowed(f)).map(describeFinding);
    expect(
      offenders,
      "a module augmentation, a `declare global` or a `@ts-expect-error` widens a type with no " +
        "cast anywhere to count — the augmentation does it for every file in the package. Type " +
        "the gap honestly, or add an entry saying why this one is unavoidable"
    ).toEqual([]);
  });

  it("has no stale exception", () => {
    // An entry whose code no longer occurs is a permission nobody is using, and
    // the cheapest way past a red gate is to widen a list that already looks
    // approved. An exception that has been fixed has to be deleted.
    const live = new Set(
      [...UNWRAPPED, ...BANNED, ...WIDENINGS].map((f) => `${f.file}::${f.code}`)
    );
    const stale = UNGATED_WITH_REASON.filter(
      (e) => !live.has(`${e.file}::${normalise(e.code)}`)
    ).map((e) => `${e.file}  ${e.code}`);
    expect(stale, "these exceptions no longer match anything — delete them").toEqual([]);
  });

  it("gives every exception a reason", () => {
    for (const entry of UNGATED_WITH_REASON) {
      expect(entry.reason.length, `${entry.file}  ${entry.code}`).toBeGreaterThan(60);
    }
  });
});

describe("the detectors fail on the shapes they exist to catch", () => {
  // A gate is a claim until you mutate the input and watch it go red. These drive
  // the SAME functions the tree is scanned with — not a restated copy of them —
  // over sources written to be wrong.
  const scanText = (text: string) => scanCrossings("synthetic.ts", parse("synthetic.ts", text));

  const ACTION = (call: string) => `
    export function register(program: Command): void {
      program.command("x").action(async (opts) => {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { name: opts.name });
        ${call}
      });
    }`;

  it("catches an operator-JSON value handed straight to an SDK method", () => {
    expect(scanText(ACTION("await client.folders.update(id, body);")).unwrapped).toHaveLength(1);
  });

  it("catches it behind a nullish default, which is where it hid", () => {
    expect(scanText(ACTION("await client.folders.update(id, body ?? {});")).unwrapped).toHaveLength(
      1
    );
  });

  it("catches it behind an assertion", () => {
    expect(
      scanText(ACTION("await client.folders.update(id, body as UpdateFolderBody);")).unwrapped
    ).toHaveLength(1);
  });

  it("passes the sanctioned form", () => {
    const scan = scanText(
      ACTION("await client.folders.update(id, asRequestBody<UpdateFolderBody>(body));")
    );
    expect(scan.unwrapped).toEqual([]);
    expect(scan.wrapped).toBe(1);
    expect(scan.untyped).toEqual([]);
  });

  it("catches a wrapped call that names no type", () => {
    expect(
      scanText(ACTION("await client.folders.update(id, asRequestBody(body));")).untyped
    ).toHaveLength(1);
  });

  it("catches it inlined at the call, where there is no local to bind", () => {
    expect(
      scanText(ACTION("await client.folders.update(id, mergeBodyWithFlags(base, {}));")).unwrapped
    ).toHaveLength(1);
  });

  it("catches an inlined helper behind a nullish default", () => {
    // Every wrapper composes with every other, so the peel has to run before any
    // classifier does. These two shapes each passed BOTH classifiers untouched.
    expect(
      scanText(ACTION("await client.folders.update(id, mergeBodyWithFlags(base, {}) ?? {});"))
        .unwrapped
    ).toHaveLength(1);
    expect(
      scanText(ACTION("await client.folders.update(id, (await resolveBody(opts.body)) ?? {});"))
        .unwrapped
    ).toHaveLength(1);
  });

  it("catches an inlined helper behind an assertion, and both at once", () => {
    expect(
      scanText(
        ACTION("await client.folders.update(id, (mergeBodyWithFlags(base, {}) ?? {}) as Body);")
      ).unwrapped
    ).toHaveLength(1);
  });

  it("still sees the sanctioned form through a wrapper", () => {
    // The peel runs ahead of the wrapper check too, so widening it cannot
    // accidentally reclassify a wrapped call as unwrapped.
    const scan = scanText(
      ACTION("await client.folders.update(id, asRequestBody<UpdateFolderBody>(body) ?? {});")
    );
    expect(scan.wrapped).toBe(1);
    expect(scan.unwrapped).toEqual([]);
  });

  it("catches it on a client the file did not name `client`", () => {
    // The gate must not be defeated by `const api = createClient(...)`.
    const text = `
      export function register(program: Command): void {
        program.command("x").action(async (opts) => {
          const api = createClient(program.optsWithGlobals());
          const body = mergeBodyWithFlags(await resolveBody(opts.body), {});
          await api.folders.update(id, body);
        });
      }`;
    expect(scanText(text).unwrapped).toHaveLength(1);
  });

  it("does not flag a body built by a typed helper", () => {
    // The false positive the scope-aware lookup exists to prevent: a sibling
    // action in the same file binds `body` to `mergeBodyWithFlags`.
    const text = `
      export function register(program: Command): void {
        program.command("a").action(async (opts) => {
          const client = createClient(program.optsWithGlobals());
          const body = mergeBodyWithFlags(await resolveBody(opts.body), {});
          await client.workflows.update(id, asRequestBody<UpdateWorkflowBody>(body));
        });
        program.command("b").action(async (opts) => {
          const client = createClient(program.optsWithGlobals());
          const body = buildTestWorkflowBody(await resolveBody(opts.body));
          await client.workflows.testWorkflow(id, body);
        });
      }`;
    expect(scanText(text).unwrapped).toEqual([]);
  });

  it("catches `as any` and `as unknown as T`, and reports the whole double assertion", () => {
    const found = scanBannedAssertions(
      "synthetic.ts",
      parse("synthetic.ts", "const a = x as any; const b = y as unknown as Thing;")
    ).map((f) => f.code);
    expect(found).toEqual(["x as any", "y as unknown as Thing"]);
  });

  it("leaves a single narrowing assertion alone", () => {
    // `opts` is untyped commander input, so `opts.type as Trigger["type"]` narrows
    // an `any`. Banning it would push the fix towards widening the target instead.
    expect(
      scanBannedAssertions(
        "synthetic.ts",
        parse("synthetic.ts", 'const t = opts.type as Trigger["type"];')
      )
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The evasions. Every one of these passed the gate clean, in a real `src/`
  // file, while a plain `x as any` beside it went red — so the scan demonstrably
  // read the same bytes each of them sat in.
  // -------------------------------------------------------------------------

  const banned = (text: string): string[] =>
    scanBannedAssertions("synthetic.ts", parse("synthetic.ts", text)).map((f) => f.code);

  const widened = (text: string): string[] =>
    scanUndeclaredWidenings("synthetic.ts", parse("synthetic.ts", text)).map((f) => f.code);

  it("catches an angle-bracket assertion, which is a different AST node", () => {
    // `<any>x` is ts.TypeAssertion; `x as any` is ts.AsExpression. A walk that
    // knows only the second reads this file and reports it clean.
    expect(banned("const a = <any>x;")).toEqual(["<any>x"]);
    expect(banned("const b = <Thing>(<unknown>y);")).toEqual(["<Thing>(<unknown>y)"]);
  });

  it("sees an angle-bracket assertion in the crossing scan too", () => {
    // `peel` is shared, so the same blindness reached detector (1): the argument
    // is operator JSON wearing an angle bracket, and neither classifier saw it.
    expect(
      scanText(ACTION("await client.folders.update(id, <UpdateFolderBody>body);")).unwrapped
    ).toHaveLength(1);
  });

  it("catches a double assertion behind one pair of brackets", () => {
    // A single keystroke: `(x as unknown) as T` puts a ParenthesizedExpression
    // between the two assertions, and the inner one stops being reachable.
    expect(banned("const a = (x as unknown) as Thing;")).toEqual(["(x as unknown) as Thing"]);
  });

  it("catches a double assertion laundered through `satisfies`", () => {
    expect(banned("const a = (x as unknown satisfies unknown) as Thing;")).toHaveLength(1);
  });

  it("catches a double assertion split across two statements", () => {
    // This is the shape detector (2) exists for, written on two lines: the value
    // arrives typed, is re-declared `unknown`, and leaves as a concrete type. The
    // outer node's inner is an identifier, so nothing matched before.
    expect(banned("function f(x: string) { const u: unknown = x; const t = u as Thing; }")).toEqual(
      ["u as Thing"]
    );
    expect(banned("function f(x: A) { const u: any = x.y; return u as Thing; }")).toEqual([
      "u as Thing"
    ]);
  });

  it("leaves the three `unknown` declarations that are correct work alone", () => {
    // All three are live in `src/` today. Redding any of them is how a gate that
    // refuses correct work gets deleted, and then the real violations flow again.
    expect(
      banned("try { f(); } catch (err: unknown) { const e = err as NodeJS.ErrnoException; }")
    ).toEqual([]);
    expect(
      banned(
        "function f(t: string) { let parsed: unknown; parsed = JSON.parse(t); return parsed as Envelope; }"
      )
    ).toEqual([]);
    expect(
      banned(
        "function f(t: string) { const parsed: unknown = JSON.parse(t); return parsed as Manifest; }"
      )
    ).toEqual([]);
  });

  it("catches an assertion to a type that merely CONTAINS `any`", () => {
    expect(banned("const bag = x as { [k: string]: any };")).toHaveLength(1);
    expect(banned("const list = x as any[];")).toHaveLength(1);
    expect(banned("const rec = x as Record<string, any>;")).toHaveLength(1);
  });

  it("catches a module augmentation, where no assertion node exists at all", () => {
    // The cheapest way past everything above, and the only one whose blast radius
    // is the package: every file importing commander then sees `_hidden` as a
    // legitimate optional, with no cast anywhere for any scan to find.
    expect(
      widened('declare module "commander" { interface Command { _hidden?: boolean } }')
    ).toEqual(['declare module "commander"']);
  });

  it("catches `declare global` and a type-checker suppression", () => {
    expect(widened("declare global { interface Window { _x: number } }")).toEqual([
      "declare global"
    ]);
    expect(widened("// @ts-expect-error narrowing is hard\nconst a: number = s;")).toEqual([
      "@ts-expect-error narrowing is hard"
    ]);
    expect(widened("// @ts-ignore\nconst a: number = s;")).toEqual(["@ts-ignore"]);
  });

  it("catches operator JSON spread into an object literal", () => {
    // `{ ...body }` is neither an identifier nor a call, so both classifiers
    // skipped it — and the value reaching the SDK is exactly the same one.
    expect(
      scanText(ACTION("await client.folders.update(id, { ...body });")).unwrapped
    ).toHaveLength(1);
    expect(
      scanText(ACTION("await client.folders.update(id, { ...body, name: opts.name });")).unwrapped
    ).toHaveLength(1);
  });

  it("catches it through a chain of local aliases", () => {
    // One rename. The lookup resolved a single hop, found an identifier rather
    // than a call, and reported the crossing clean.
    expect(
      scanText(ACTION("const payload = body; await client.folders.update(id, payload);")).unwrapped
    ).toHaveLength(1);
  });

  it("catches it on a destructured client", () => {
    // `const { folders } = createClient(...)` binds no plain identifier, so the
    // binding lookup found nothing and the call reached no SDK as far as the gate
    // could tell. Renaming the local was the whole evasion.
    const text = `
      export function register(program: Command): void {
        program.command("x").action(async (opts) => {
          const { folders } = createClient(program.optsWithGlobals());
          const body = mergeBodyWithFlags(await resolveBody(opts.body), {});
          await folders.update(id, body);
        });
      }`;
    expect(scanText(text).unwrapped).toHaveLength(1);
  });

  it("sees operator JSON behind a non-null assertion", () => {
    // One keystroke, and the same class as the angle bracket above: `body!` is a
    // ts.NonNullExpression wrapping the identifier, so a peel that does not know
    // the node hands every classifier a wrapper instead of the value, and the
    // crossing reads clean. It asserts nothing a cast scan could count either.
    expect(scanText(ACTION("await client.folders.update(id, body!);")).unwrapped).toHaveLength(1);
    expect(
      scanText(ACTION("await client.folders.update(id, (body ?? {})!);")).unwrapped
    ).toHaveLength(1);
  });

  it("leaves an ordinary module alone", () => {
    // `namespace X {}` and a plain import are not augmentations. Only a module
    // declaration naming a STRING — the specifier of something someone else owns.
    expect(
      widened('import { x } from "commander";\nexport namespace Local { export const a = 1; }')
    ).toEqual([]);
  });
});
