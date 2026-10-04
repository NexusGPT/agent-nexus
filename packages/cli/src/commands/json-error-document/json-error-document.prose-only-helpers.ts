import ts from "typescript";

import { type FunctionFacts, functionFacts } from "./json-error-document.function-facts";

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
