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
 * Two things are therefore checked, over the real `src/` tree:
 *
 *  1. an operator-JSON value handed to an SDK method must be wrapped;
 *  2. `as any` and `as unknown as T` must not appear at all.
 *
 * (2) exists because (1) is evadable by one keystroke: a double assertion at the
 * DECLARATION makes the identifier reach the call already typed, which is the exact
 * shape `asRequestBody` replaced.
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

function finding(file: string, sf: ts.SourceFile, node: ts.Node): Finding {
  return {
    file,
    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    code: normalise(node.getText(sf))
  };
}

const isScopeNode = (n: ts.Node): boolean =>
  ts.isSourceFile(n) ||
  ts.isBlock(n) ||
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/**
 * The initializer of the nearest binding of `name`, or null.
 *
 * Scope-aware on purpose. A file-wide name lookup reported `workflow test` and
 * `workflow test-node` as unwrapped crossings because a DIFFERENT action in the
 * same file binds `body` to `mergeBodyWithFlags`; both actually build their body
 * through a typed helper. Two false positives in a gate this size is how an
 * allowlist starts absorbing things that are fine.
 */
function nearestBindingInit(node: ts.Node, name: string): ts.Expression | null {
  for (let scope: ts.Node | undefined = node.parent; scope; scope = scope.parent) {
    if (!isScopeNode(scope)) continue;
    let found: ts.VariableDeclaration | null = null;
    const scan = (n: ts.Node): void => {
      if (found !== null) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) {
        found = n;
        return;
      }
      // Never descend into a nested function: its bindings are not in scope here.
      if (n !== scope && isScopeNode(n) && !ts.isBlock(n)) return;
      ts.forEachChild(n, scan);
    };
    scan(scope);
    if (found !== null) return (found as ts.VariableDeclaration).initializer ?? null;
  }
  return null;
}

/**
 * Strip every wrapper an argument can reach a call site through.
 *
 * `await x`, `(x)`, `x as T` and `x ?? {}` — repeatedly, and in any order, because
 * they compose: `(await resolveBody(o)) ?? {}` is three of them. One shared peel is
 * what stops a wrapper being handled in one classifier and not the next.
 */
function peel(expr: ts.Expression): ts.Expression {
  let e: ts.Expression = expr;
  for (;;) {
    if (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) {
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

        // Inlined at the call, with no local to bind.
        if (isOperatorJson(inner)) {
          out.unwrapped.push(finding(file, sf, n));
          continue;
        }

        if (!ts.isIdentifier(inner)) continue;

        const boundTo = nearestBindingInit(inner, inner.text);
        if (boundTo !== null && isOperatorJson(boundTo)) {
          out.unwrapped.push(finding(file, sf, n));
        }
      }
    }
    ts.forEachChild(n, visit);
  };

  visit(sf);
  return out;
}

/** `as any`, and the `as unknown as T` double assertion that hides from an `as any` grep. */
function scanBannedAssertions(file: string, sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isAsExpression(n)) {
      const isAny = n.type.kind === ts.SyntaxKind.AnyKeyword;
      const isDouble =
        ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword;
      // Report the OUTER node of a double assertion, so the finding reads as the
      // whole `x as unknown as T` rather than as a bare `x as unknown`.
      if (isAny || isDouble) out.push(finding(file, sf, n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
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

  it("has no stale exception", () => {
    // An entry whose code no longer occurs is a permission nobody is using, and
    // the cheapest way past a red gate is to widen a list that already looks
    // approved. An exception that has been fixed has to be deleted.
    const live = new Set([...UNWRAPPED, ...BANNED].map((f) => `${f.file}::${f.code}`));
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
});
