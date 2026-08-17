import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `workflow node-type --json` CARRIES THE GUIDE, BECAUSE THE HUMAN PATH DROPS IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SPLIT THIS GUARDS, AND WHY IT IS A TRAP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A node type's `guide` is 4-13 KB of Markdown carrying its own newlines, and
 * `printRecord` renders a record as `<padded label>  <value>` on one line each.
 * Handed the guide as an ordinary field it wrecks the alignment of every row
 * after it, so the human path destructures it out and prints it as a block
 * underneath.
 *
 * That destructure is one line away from silently emptying `--json`.
 * `printRecord` short-circuits to `emitDocument` under `--json`, so whichever
 * object reaches it IS the wire payload — and `const { guide, ...schema } =
 * result` placed one line higher would hand it `schema`, dropping the largest
 * and newest field from every scripted read while the terminal output stayed
 * perfect. Nothing else would notice: the command exits 0, the JSON parses, and
 * every field a caller was reading before is still there.
 *
 * So the ORDER is the contract: the `--json` arm must return before anything
 * narrows `result`.
 *
 * ── WHY THIS READS THE SOURCE INSTEAD OF RUNNING THE COMMAND ────────────────
 *
 * Running it needs a live API or a stubbed transport, and a stub would have to
 * decide what the server returns — which is the half already pinned server-side
 * by `node-type-guides.spec.ts` and by the contract round-trip in
 * `workflow-response-contract.spec.ts`. What is NOT pinned anywhere else is that
 * this client hands the whole object to the JSON channel, and that is a property
 * of the code rather than of a response.
 */

const ACTION_SOURCE = path.resolve(__dirname, "commands/workflow-builder.ts");

/** The `.action(...)` callback body registered on the `node-type` command. */
function nodeTypeActionBody(): string {
  const text = fs.readFileSync(ACTION_SOURCE, "utf8");
  const source = ts.createSourceFile(ACTION_SOURCE, text, ts.ScriptTarget.Latest, true);

  let found: string | undefined;

  const visit = (node: ts.Node): void => {
    // `.command("node-type")` anchors the chain; the `.action(...)` that
    // follows it in the same fluent expression is the one under test.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "command" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "node-type"
    ) {
      // Walk OUTWARD to the whole statement, then take the `.action` argument.
      let outer: ts.Node = node;
      while (outer.parent && !ts.isExpressionStatement(outer.parent)) {
        outer = outer.parent;
      }
      const statement = outer.parent ?? outer;
      const findAction = (n: ts.Node): void => {
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "action" &&
          n.arguments.length === 1
        ) {
          found = n.arguments[0].getText(source);
        }
        ts.forEachChild(n, findAction);
      };
      findAction(statement);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found ?? "";
}

describe("workflow node-type --json carries the guide", () => {
  const body = nodeTypeActionBody();

  it("finds the action at all", () => {
    // A rename of the command, or a refactor that moves the action out of the
    // fluent chain, would leave every assertion below asserting over an empty
    // string — green, and testing nothing. This is that floor.
    expect(body).not.toBe("");
    expect(body).toContain("getNodeTypeSchema");
  });

  it("returns from the --json arm before anything narrows the result", () => {
    const jsonArm = body.indexOf("isJsonMode()");
    const destructure = body.search(/const\s*\{\s*guide\s*(?::\s*\w+\s*)?,\s*\.\.\./);

    expect(jsonArm).toBeGreaterThan(-1);
    expect(destructure).toBeGreaterThan(-1);
    expect(jsonArm).toBeLessThan(destructure);
  });

  it("hands the WHOLE result to the json channel", () => {
    const jsonArm = body.slice(body.indexOf("isJsonMode()"));
    const beforeDestructure = jsonArm.slice(
      0,
      jsonArm.search(/const\s*\{\s*guide\s*(?::\s*\w+\s*)?,\s*\.\.\./)
    );

    // Not `printRecord(schema)` and not `printRecord({ ...result })` — the
    // object the server sent, unaltered.
    expect(beforeDestructure).toContain("printRecord(result)");
    expect(beforeDestructure).toContain("return");
  });
});
