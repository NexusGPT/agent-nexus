import ts from "typescript";

import { dottedName, isBareJsonLog, isFunctionLike } from "./json-error-document.ast";
import { DOCUMENT_EMITTERS, STDERR_PROSE } from "./json-error-document.tables";

/** What has definitely happened on the path to a statement. */
export interface PathState {
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
export function foldSequentialCalls(
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
export function emitsDocument(node: ts.Node): boolean {
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
export function documentFollows(statement: ts.Node): boolean {
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
