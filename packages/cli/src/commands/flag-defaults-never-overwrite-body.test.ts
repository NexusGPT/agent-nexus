import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * A commander DEFAULT must never reach `mergeBodyWithFlags`.
 *
 * `mergeBodyWithFlags` lets a flag win over `--body`, and every call site tests
 * `opts.x !== undefined` to mean "the operator passed --x". A commander default
 * makes that test true forever, so the flag wins even when nobody typed it — and
 * `--body` is silently rewritten.
 *
 * `nexus tool connect` shipped the worked example. `--auth-type` was declared
 * with a default of `"oauth"`, so the command's OWN documented example,
 *
 *   nexus tool connect tool-123 --body '{"authType":"http","apiKey":"sk-abc"}'
 *
 * reached the server as `{"authType":"oauth", ...}`: the discriminant of a
 * discriminated union, flipped, by a flag the operator never used. Nothing could
 * see it. `tsc` types the merge as `Record<string, unknown>`, the flag is
 * genuinely not `undefined`, and commander exposes no difference between a
 * default and an explicit value at the point the merge reads it.
 *
 * So the invariant is structural rather than remembered: a flag that `--body`
 * can also supply carries NO default, and its default is applied after both
 * sources are read — see `readStringField` in `util/body.ts`. This gate holds
 * the line.
 */

/** The merge whose precedence a default silently hijacks. `util/body.ts`. */
const MERGE_HELPER = "mergeBodyWithFlags";

/**
 * The per-field read with the same precedence, and the same hazard.
 * `readStringField(opts.x, base, "x")` returns the flag first, so a commander
 * default wins there exactly as it wins in the merge.
 *
 * This helper was added by the commit that fixed `tool connect`, which stopped
 * calling `MERGE_HELPER` — so a gate that knew only about the merge went silent
 * on the very command it was written for. A mutant proved it: restoring the
 * `--auth-type` default turned the wire test red and left this file green.
 */
const FIELD_READER = "readStringField";

/** The option that makes a command's flags overwrite something. */
const BODY_FLAG = "--body";

/**
 * Exceptions, each with the reason it is not simply fixed.
 *
 * Keyed on the option flag and the file, never a line number, and every entry is
 * asserted to still match something — an exception that has been fixed has to be
 * deleted rather than left as a standing permission.
 */
const ALLOWED_DEFAULTS: readonly { file: string; flag: string; reason: string }[] = [];

interface Finding {
  file: string;
  line: number;
  flag: string;
  default: string;
}

const describeFinding = (f: Finding): string =>
  `${f.file}:${f.line}  ${f.flag} defaults to ${f.default} and is merged over ${BODY_FLAG}`;

/**
 * The flag string of an `.option(...)` / `.requiredOption(...)` call — the LONG
 * form, since that is what a reader greps for and what commander derives the
 * `opts` key from.
 */
function flagOf(call: ts.CallExpression): string | null {
  const first = call.arguments[0];
  if (first === undefined || !ts.isStringLiteralLike(first)) return null;
  const long = first.text.split(/[,|]\s*/).find((part) => part.startsWith("--"));
  return long === undefined ? null : long.split(/[ [<]/)[0];
}

/**
 * The literal default an `.option(...)` declares, or null.
 *
 * Commander reads its last argument as the default, and the argument before it
 * as a coercion function when there are four. So a value in either slot counts,
 * and an identifier (`parseInt`, `collectMetadata`) never does — a coercion
 * function is not a default.
 */
function literalDefault(call: ts.CallExpression): ts.Expression | null {
  const last = call.arguments[call.arguments.length - 1];
  if (last === undefined || call.arguments.length < 3) return null;
  if (ts.isIdentifier(last) || ts.isFunctionExpression(last) || ts.isArrowFunction(last)) {
    return null;
  }
  return last;
}

/** The `opts` key commander derives from a long flag: `--auth-type` -> `authType`. */
function optionKey(flag: string): string {
  return flag.replace(/^--/, "").replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Every `opts.<key>` that reaches a MERGED VALUE — the only position from which a
 * default can overwrite `--body`.
 *
 * Position, not mention. `...(metadataFlags.length > 0 && { metadata: parse(metadataFlags) })`
 * mentions no `opts` at all: the flag was read into a local and the spread is
 * guarded, so its `[]` default reaches nothing and reporting it is a false
 * positive. `...(opts.mode !== undefined && { mode: opts.mode })` puts `opts.mode`
 * in the VALUE, and its `"single"` default overwrote `--body` every time.
 *
 * So a spread contributes only the right operand of its guard, and a property
 * contributes only its initializer. A gate that counted mentions would flag the
 * guard condition itself and be wrong on both.
 */
function mergedOptionKeys(action: ts.Node): Set<string> {
  const keys = new Set<string>();

  const collectAccesses = (node: ts.Node): void => {
    const visit = (n: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "opts"
      ) {
        keys.add(n.name.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  const collectFromValues = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop)) collectAccesses(prop.initializer);
        else if (ts.isSpreadAssignment(prop)) {
          // `...(cond && { k: v })` — the parentheses are part of the syntax, so
          // a check that reads the spread expression directly sees a
          // ParenthesizedExpression, never the `&&`, and falls through to
          // scanning the whole thing. That turns this arm back into a mention
          // detector and reports the guard condition as a merged value.
          let e: ts.Expression = prop.expression;
          while (ts.isParenthesizedExpression(e)) e = e.expression;
          if (
            ts.isBinaryExpression(e) &&
            e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          ) {
            collectFromValues(e.right);
          } else {
            collectFromValues(e);
          }
        }
      }
      return;
    }
    collectAccesses(node);
  };

  /**
   * The flags argument of every `mergeBodyWithFlags(base, X)`, and the flag
   * argument of every `readStringField(opts.x, base, "x")`, in this action.
   */
  const flagArgs: ts.Expression[] = [];
  const findReaders = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text === MERGE_HELPER && n.arguments.length > 1) {
        flagArgs.push(n.arguments[1]);
      } else if (n.expression.text === FIELD_READER && n.arguments.length > 0) {
        collectAccesses(n.arguments[0]);
      }
    }
    ts.forEachChild(n, findReaders);
  };
  findReaders(action);

  for (const arg of flagArgs) {
    if (!ts.isIdentifier(arg)) {
      collectFromValues(arg);
      continue;
    }
    // `const flags = {...}` built up by `flags.x = ...` statements before the call.
    const bagName = arg.text;
    const visit = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === bagName &&
        n.initializer !== undefined
      ) {
        collectFromValues(n.initializer);
      }
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(n.left) &&
        ts.isIdentifier(n.left.expression) &&
        n.left.expression.text === bagName
      ) {
        collectAccesses(n.right);
      }
      ts.forEachChild(n, visit);
    };
    visit(action);
  }

  return keys;
}

/** Every call in a fluent chain, outermost first: `a.b().c()` -> [c, b]. */
function chainCalls(expr: ts.Expression): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  let e: ts.Expression = expr;
  for (;;) {
    if (ts.isCallExpression(e)) {
      out.push(e);
      e = e.expression;
    } else if (ts.isPropertyAccessExpression(e)) {
      e = e.expression;
    } else {
      return out;
    }
  }
}

const calleeName = (call: ts.CallExpression): string =>
  ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";

function mentions(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

interface Scan {
  offenders: Finding[];
  /** Commands seen, and body-merging commands among them — the floors below. */
  commands: number;
  merging: number;
}

/**
 * Walk each fluent command chain in a file and report a defaulted option
 * declared on a command that merges flags over `--body`.
 *
 * Chain-scoped on purpose. A command module registers a dozen subcommands, and a
 * default on one of them says nothing about its siblings — `nexus workflow
 * executions --interval 1500` is a polling interval on a command with no `--body`
 * at all, and a file-wide scan reports it as an offender.
 */
function scan(file: string, sf: ts.SourceFile): Scan {
  const out: Scan = { offenders: [], commands: 0, merging: 0 };

  const visit = (node: ts.Node): void => {
    // The outermost call of a chain — its parent is never another call's callee.
    const isChainRoot =
      ts.isCallExpression(node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node);

    if (isChainRoot) {
      const calls = chainCalls(node as ts.CallExpression);
      const options = calls.filter((c) => ["option", "requiredOption"].includes(calleeName(c)));

      if (options.length > 0) {
        out.commands++;
        const hasBody = options.some((c) => flagOf(c) === BODY_FLAG);
        const action = calls.find((c) => calleeName(c) === "action");
        const merges =
          action !== undefined &&
          (mentions(action, MERGE_HELPER) || mentions(action, FIELD_READER));

        if (hasBody && merges && action !== undefined) {
          out.merging++;
          const merged = mergedOptionKeys(action);
          for (const opt of options) {
            const def = literalDefault(opt);
            const flag = flagOf(opt);
            if (def === null || flag === null) continue;
            if (!merged.has(optionKey(flag))) continue;
            out.offenders.push({
              file,
              line: sf.getLineAndCharacterOfPosition(opt.getStart(sf)).line + 1,
              flag,
              default: def.getText(sf)
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

// ---------------------------------------------------------------------------
// The tree.
// ---------------------------------------------------------------------------

function commandSources(): string[] {
  return readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
    .map((e) => relative(SRC_DIR, join(SRC_DIR, e.name)));
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
}

const FILES = commandSources();
const SCANS = FILES.map((file) =>
  scan(file, parse(file, readFileSync(join(SRC_DIR, file), "utf-8")))
);
const OFFENDERS = SCANS.flatMap((s) => s.offenders);
const COMMANDS = SCANS.reduce((n, s) => n + s.commands, 0);
const MERGING = SCANS.reduce((n, s) => n + s.merging, 0);

const allowed = (f: Finding): boolean =>
  ALLOWED_DEFAULTS.some((e) => e.file === f.file && e.flag === f.flag);

describe("a commander default never overwrites --body", () => {
  it("walked the tree and found body-merging commands in it", () => {
    // Guards the gate. A moved directory, a renamed helper or a walk that throws
    // would leave every assertion below vacuously true over an empty set, which
    // is indistinguishable from a clean pass. The floors sit well under what was
    // measured when this was written, so deleting a command does not turn the
    // gate red for the wrong reason.
    expect(FILES.length).toBeGreaterThan(30);
    expect(COMMANDS).toBeGreaterThan(100);
    expect(MERGING).toBeGreaterThan(10);
  });

  it("declares no defaulted flag on a command that merges flags over --body", () => {
    expect(
      OFFENDERS.filter((f) => !allowed(f)).map(describeFinding),
      "drop the commander default and apply it after --body is read — see readStringField " +
        "in util/body.ts. A default is not distinguishable from an explicit flag."
    ).toEqual([]);
  });

  it("has no stale exception", () => {
    const live = new Set(OFFENDERS.map((f) => `${f.file}::${f.flag}`));
    expect(
      ALLOWED_DEFAULTS.filter((e) => !live.has(`${e.file}::${e.flag}`)).map(
        (e) => `${e.file}  ${e.flag}`
      ),
      "these exceptions no longer match anything — delete them"
    ).toEqual([]);
  });

  it("gives every exception a reason", () => {
    for (const entry of ALLOWED_DEFAULTS) {
      expect(entry.reason.length, `${entry.file}  ${entry.flag}`).toBeGreaterThan(60);
    }
  });
});

describe("the detector fails on the shape it exists to catch", () => {
  // A gate is a claim until the input is mutated and it goes red. These drive the
  // SAME function the tree is scanned with, over sources written to be wrong.
  const scanText = (text: string) => scan("synthetic.ts", parse("synthetic.ts", text));

  const COMMAND = (option: string, merge = "{ authType: opts.authType }") => `
    export function register(program: Command): void {
      program
        .command("connect")
        ${option}
        .option("--body <json>", "Request body as JSON")
        .action(async (id, opts) => {
          const base = await resolveBody(opts.body);
          const body = mergeBodyWithFlags(base, ${merge});
          await client.toolConnection.connect(id, asRequestBody<ConnectToolBody>(body));
        });
    }`;

  it("catches the default that flipped a discriminant", () => {
    const found = scanText(
      COMMAND('.option("--auth-type <type>", "Auth type", "oauth")')
    ).offenders;
    expect(found).toHaveLength(1);
    expect(found[0].flag).toBe("--auth-type");
    expect(found[0].default).toBe('"oauth"');
  });

  it("catches a default sitting behind a coercion function", () => {
    // `.option(flag, desc, coerce, default)` is four arguments, and the default
    // is the last one. Reading only the third argument makes this arm blind.
    const found = scanText(
      COMMAND(
        '.option("--max-pages <n>", "Max pages", parseInt, 20)',
        "{ maxPages: opts.maxPages }"
      )
    ).offenders;
    expect(found).toHaveLength(1);
    expect(found[0].default).toBe("20");
  });

  it("catches it through a flags bag built statement by statement", () => {
    // The other shape this package writes. Reading only an inline object literal
    // leaves every `const flags = {}; flags.x = opts.x;` command unguarded.
    const text = `
      export function register(program: Command): void {
        program
          .command("connect")
          .option("--auth-type <type>", "Auth type", "oauth")
          .option("--body <json>", "Request body as JSON")
          .action(async (id, opts) => {
            const base = await resolveBody(opts.body);
            const flags: Record<string, unknown> = {};
            if (opts.authType !== undefined) flags.authType = opts.authType;
            const body = mergeBodyWithFlags(base, flags);
            await client.toolConnection.connect(id, asRequestBody<ConnectToolBody>(body));
          });
      }`;
    expect(scanText(text).offenders.map((f) => f.flag)).toEqual(["--auth-type"]);
  });

  it("catches a default read through readStringField, which merges nothing", () => {
    // The shape the fixed `tool connect` uses. A gate that only knew about
    // `mergeBodyWithFlags` went green on exactly the command it was written for.
    const text = `
      export function register(program: Command): void {
        program
          .command("connect")
          .option("--auth-type <type>", "Auth type", "oauth")
          .option("--body <json>", "Request body as JSON")
          .action(async (id, opts) => {
            const base = await resolveBody(opts.body);
            const authType = readStringField(opts.authType, base, "authType") ?? "oauth";
            await client.toolConnection.connect(id, { authType });
          });
      }`;
    const found = scanText(text).offenders;
    expect(found.map((f) => f.flag)).toEqual(["--auth-type"]);
  });

  it("catches it inside a guarded spread, where the value is what merges", () => {
    expect(
      scanText(
        COMMAND(
          '.option("--mode <mode>", "Crawl mode", "single")',
          "{ ...(opts.mode !== undefined && { mode: opts.mode }) }"
        )
      ).offenders.map((f) => f.flag)
    ).toEqual(["--mode"]);
  });

  it("passes the same command with no default", () => {
    expect(scanText(COMMAND('.option("--auth-type <type>", "Auth type")')).offenders).toEqual([]);
  });

  it("does not call a coercion function a default", () => {
    expect(
      scanText(COMMAND('.option("--auth-type <type>", "Auth type", parseAuthType)')).offenders
    ).toEqual([]);
  });

  it("leaves a defaulted flag alone when its value never reaches the merge", () => {
    // `--metadata` collects into `[]`, is read into a local, and merges only
    // behind a `length > 0` guard — so the default reaches nothing. A detector
    // that counted MENTIONS instead of value positions reported this as an
    // offender, and an exception list is how a false positive becomes permanent.
    const text = `
      export function register(program: Command): void {
        program
          .command("add-website")
          .option("--metadata <key=value...>", "Metadata", collectMetadata, [])
          .option("--body <json>", "Request body as JSON")
          .action(async (opts) => {
            const base = await resolveBody(opts.body);
            const metadataFlags = opts.metadata as string[];
            const body = mergeBodyWithFlags(base, {
              ...(metadataFlags.length > 0 && { metadata: parseMetadataPairs(metadataFlags) })
            });
            await client.documents.addWebsite(asRequestBody<AddWebsiteDocumentBody>(body));
          });
      }`;
    expect(scanText(text).offenders).toEqual([]);
  });

  it("does not mistake a guard condition for a merged value", () => {
    // `...(opts.force !== undefined && { mode: "x" })` mentions `opts.force` in
    // the CONDITION only. Its default cannot overwrite anything.
    expect(
      scanText(
        COMMAND(
          '.option("--force <bool>", "Force", "false")',
          '{ ...(opts.force !== undefined && { mode: "x" }) }'
        )
      ).offenders
    ).toEqual([]);
  });

  it("leaves a defaulted flag alone when the command has no --body", () => {
    // The false positive that a file-wide scan produces: a sibling subcommand in
    // the same module merges a body, and this one is a polling interval.
    const text = `
      export function register(program: Command): void {
        program
          .command("watch")
          .option("--interval <ms>", "Poll interval", "1500")
          .action(async (opts) => {
            await poll(Number(opts.interval));
          });
      }`;
    const result = scanText(text);
    expect(result.offenders).toEqual([]);
    expect(result.commands).toBe(1);
    expect(result.merging).toBe(0);
  });

  it("leaves a defaulted flag alone when the command takes --body but merges nothing", () => {
    const text = `
      export function register(program: Command): void {
        program
          .command("run")
          .option("--format <fmt>", "Output format", "table")
          .option("--body <json>", "Request body as JSON")
          .action(async (opts) => {
            const body = await resolveRequiredBody(opts.body);
            await client.things.run(asRequestBody<RunBody>(body));
          });
      }`;
    expect(scanText(text).offenders).toEqual([]);
  });

  it("scopes each subcommand separately inside one module", () => {
    // Two chains in one file: only the merging one may be reported.
    const text = `${COMMAND('.option("--auth-type <type>", "Auth type", "oauth")')}
      export function registerOther(program: Command): void {
        program
          .command("watch")
          .option("--interval <ms>", "Poll interval", "1500")
          .action(async (opts) => { await poll(opts.interval); });
      }`;
    const found = scanText(text).offenders;
    expect(found.map((f) => f.flag)).toEqual(["--auth-type"]);
  });
});
