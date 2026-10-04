/**
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
 */

import ts from "typescript";

/** The conditions that govern whether `node` runs, up to `stop`. */
export function governingConditions(node: ts.Node, stop: ts.Node): ts.Expression[] {
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
export function isExitPath(node: ts.Node, source: ts.SourceFile): boolean {
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
