import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { printSuccess, setJsonMode } from "./output";

/**
 * `--json` NEVER CARRIES LESS THAN THE HUMAN OUTPUT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `printSuccess(message, data)` printed `message` to a human and dropped it from
 * the JSON document. Harmless while the message restates the data. Not harmless
 * where the message is chosen ON THE RESULT:
 *
 *     printSuccess(result.removed ? "Workspace revoked." : "No such grant.",
 *                  { removed: result.removed })
 *
 * There the branch IS the diagnosis, and `--json` emitted a bare
 * `removed: false` — which reads as "the operation failed" rather than "you
 * named a thing that does not exist". A caller who passed a workspace id where
 * `revoke-workspace` wants a GRANT id got the boolean and not the sentence, and
 * the sentence was the whole explanation. Every layer had already named the id
 * correctly — the route, the SDK docblock, the CLI's own `<grant-id>` argument
 * description — so there was no copy left to clarify. What was missing was the
 * failure SAYING it had failed, on the surface the caller was reading.
 *
 * ── THE POPULATION IS DERIVED, NOT TYPED IN ──────────────────────────────────
 *
 * The strings below are pulled out of the source by an AST walk over every
 * `printSuccess` call with a conditional message. A list typed into this file
 * would be exactly the defect it is guarding: a ninth call site added tomorrow
 * would not be in it, and the gate would stay green while the case nobody
 * declared went unprotected.
 *
 * Both floors are asserted, so a walk that collapsed to nothing FAILS rather
 * than passes. A sweep that cannot show it would have found something is not
 * evidence.
 */

const SRC = path.resolve(__dirname);

/** Every non-test `.ts` under `src/`. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

interface ConditionalMessage {
  readonly where: string;
  readonly branches: readonly string[];
}

/**
 * Every `printSuccess` whose message is chosen at runtime, with both branch
 * strings.
 *
 * Only string LITERAL branches are collected — a computed branch has no fixed
 * text to assert on. That narrows the population and never widens it, so the
 * count below is a floor.
 */
function conditionalMessages(): { total: number; conditional: ConditionalMessage[] } {
  const files = sourceFiles(SRC);
  if (files.length === 0) throw new Error("no source files — the walk is broken, not the code");

  let total = 0;
  const conditional: ConditionalMessage[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "printSuccess"
      ) {
        total++;
        const message = node.arguments[0];
        if (message !== undefined && ts.isConditionalExpression(message)) {
          const branches = [message.whenTrue, message.whenFalse]
            .filter((b) => ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b))
            .map((b) => (b as ts.StringLiteralLike).text);
          if (branches.length === 2) {
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            conditional.push({ where: `${path.relative(SRC, file)}:${line}`, branches });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { total, conditional };
}

afterEach(() => {
  setJsonMode(false);
});

/** The JSON document a scripted caller receives from one `printSuccess`. */
function jsonDocument(message: string, data?: object): Record<string, unknown> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    setJsonMode(true);
    printSuccess(message, data);
  } finally {
    console.log = log;
  }
  return JSON.parse(lines.join("\n")) as Record<string, unknown>;
}

describe("the --json document carries every diagnostic the human output prints", () => {
  const { total, conditional } = conditionalMessages();

  it("finds a real population to check", () => {
    // Floors, not equalities: a new command must not have to edit this file.
    // But a walk that found nothing must FAIL — that is the state this whole
    // file would otherwise pass in, having proved nothing.
    expect(total).toBeGreaterThan(100);
    expect(conditional.length).toBeGreaterThanOrEqual(8);
  });

  it.each(conditional)(
    "$where — both outcomes are distinguishable under --json",
    ({ branches }) => {
      const [whenTrue, whenFalse] = branches;

      // The two outcomes must not merely both be present; they must DIFFER.
      // A message that reads the same either way is a boolean with extra
      // characters, which is the defect wearing the fix's clothes.
      expect(whenTrue).not.toEqual(whenFalse);

      expect(jsonDocument(whenTrue).message).toBe(whenTrue);
      expect(jsonDocument(whenFalse).message).toBe(whenFalse);
    }
  );

  it("keeps the data fields it already carried", () => {
    const doc = jsonDocument("No such grant.", { removed: false });

    expect(doc).toEqual({ success: true, message: "No such grant.", removed: false });
  });

  it("says the same thing to a human", () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      setJsonMode(false);
      printSuccess("No such grant.", { removed: false });
    } finally {
      console.log = log;
    }

    // The asymmetry is the defect, so the human form is asserted beside the
    // JSON one rather than trusted. Both surfaces, one fact.
    expect(lines.join("\n")).toContain("No such grant.");
  });
});
