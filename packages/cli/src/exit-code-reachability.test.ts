import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { EXIT_INSTALLED_BUT_NOT_RESOLVED, EXIT_VERIFICATION_NOT_YOURS } from "./commands/upgrade";
import { handleError, printNotFound, refuse, reportFailure } from "./errors";
import { callsProcessExitWith } from "./exit-code-process-exit-call.testkit";
import { codeOnly, productionSources, SRC_DIR } from "./exit-code-sources.testkit";
import { EXIT_CATEGORIES, EXIT_CODES, type ExitCategory } from "./exit-codes";

/**
 * EVERY DECLARED EXIT CATEGORY IS PRODUCED, AND NOTHING THAT PRODUCES ONE
 * RETURNS A BARE INTEGER.
 *
 * ⚠️ EVERY `it.each` IN THIS FILE GOES THROUGH `eachOrRefuse`. vitest SILENTLY
 * DROPS an `it.each([])` — it registers nothing and exits 0, where jest throws.
 * A table that goes empty is the same false green as the count floor, one layer
 * down; a real file in this package went from 65 passing tests to 11 that way.
 * `eachOrRefuse` throws on an empty table, naming the population that was meant
 * to fill it, so a derived table cannot silently stop testing anything. Cases
 * that are not tables are plain `it()`, never a bare `.each`.
 */

/**
 * A source file CONTAINS a process-level exit for `category`.
 *
 * `success` and `interrupted` are the two categories no function RETURNS — one
 * is the absence of a failure, the other is a signal. Both are produced by a
 * `process.exit(...)` a spec cannot call without ending the run, so the
 * production path is asserted by reading the CODE of the file that holds it,
 * through `callsProcessExitWith`. `interrupted`'s file quotes the very call in
 * its docblock, and a raw read let that quote stand in for a deleted producer.
 * Returns the declared code when the call is there, and `-1` when it is not, so
 * the case fails with the same shape as every returning producer.
 */
function processLevelExit(file: string, category: ExitCategory): number {
  const source = readFileSync(join(SRC_DIR, file), "utf8");
  return callsProcessExitWith(source, category) ? EXIT_CODES[category] : -1;
}

/**
 * EVERY DECLARED CATEGORY HAS A PRODUCER, AND IT PRODUCES THE DECLARED NUMBER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE OTHER DIRECTION, AND WITHOUT IT THE TAXONOMY CAN GROW DEAD
 *    ENTRIES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The integer-literal scans in `exit-code-taxonomy.test.ts` answer "is every
 * code the CLI emits declared?". They cannot answer "is every declared code
 * reachable?" — a category nothing produces is a
 * published promise with no code behind it, which is the same class of defect as
 * the `--help` sentence this change deleted, pointed the other way.
 *
 * `Record<ExitCategory, …>` makes it EXHAUSTIVE AT COMPILE TIME: adding a
 * category without a producer is a type error here, before any test runs. The
 * runtime table below is derived from `EXIT_CATEGORIES`, so it cannot list a
 * category the taxonomy dropped — and `eachOrRefuse` refuses if that derivation
 * ever yields nothing.
 */
const PRODUCERS: Readonly<Record<ExitCategory, () => number>> = {
  success: () => processLevelExit("contract-binding.bind-command.ts", "success"),
  interrupted: () =>
    processLevelExit(join("commands", "apps", "logs", "run-app-logs-follow.ts"), "interrupted"),
  failed: () => handleError(new Error("unexpected")),
  "not-authenticated": () => handleError(new NexusAuthenticationError("nope", "UNAUTHORIZED")),
  "permission-denied": () => handleError(new NexusApiError("FORBIDDEN", "nope", 403)),
  "not-found": () => printNotFound("gone"),
  "invalid-input": () => refuse("--body is required."),
  "remote-error": () => handleError(new NexusApiError("INTERNAL", "boom", 500)),
  "connection-failed": () => handleError(new NexusConnectionError("offline")),
  "timed-out": () => handleError(new NexusTimeoutError(30_000)),
  "local-failed": () => reportFailure("local-failed", "install failed"),
  // Not a call: `runUpgrade` needs a whole injected environment, and
  // `upgrade-environment.test.ts` already drives it end to end. What this
  // asserts is the BINDING — that the command's two named outcomes still point
  // at these two categories and not at a number of their own.
  "outcome-not-reached": () => EXIT_INSTALLED_BUT_NOT_RESOLVED,
  unmeasured: () => EXIT_VERIFICATION_NOT_YOURS
};

describe("every declared exit category is reachable, and produces its own number", () => {
  it.each(
    eachOrRefuse(
      EXIT_CATEGORIES.map((category) => [category, PRODUCERS[category]] as const),
      "every category declared in EXIT_CODES"
    )
  )("%s is produced, and produces its declared code", (category, produce) => {
    const produced = produce();
    expect({ category, produced }).toEqual({ category, produced: EXIT_CODES[category] });
  });
});

/**
 * THE HOLE THIS CLOSES, AND IT WAS A REAL ONE IN THE TAXONOMY GATE'S FIRST
 * VERSION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE SCANS IN `exit-code-taxonomy.test.ts` LOOK FOR `process.exit(<int>)`
 *    AND `process.exitCode = <int>`. A FIFTH MAP HID BEHIND A FUNCTION CALL AND
 *    PASSED ALL OF THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps-watch.ts` spelled its verdict `return kind === "served" ? 0 : 1` inside
 * `reportWatchOutcome`, plus six bare `return 1`s. The call site reads
 * `process.exitCode = runDeploymentWatch(...)` — no integer anywhere near
 * `process.exitCode`, so every one of those scans was green over a map the
 * taxonomy did not own. It was found by reading, which is exactly the thing a
 * gate is for.
 *
 * So the population is DERIVED, not listed: any identifier called directly in
 * `process.exitCode = <name>(…)` or `process.exit(<name>(…))` is an
 * exit-producing function, and its body may not contain a bare integer verdict.
 *
 * ⚠️ ONE LEVEL IS NOT ENOUGH, AND THIS WAS MEASURED RATHER THAN ARGUED. The
 * direct call is `process.exitCode = runDeploymentWatch(…)`; the literals were
 * one hop further, in `reportWatchOutcome`, which `runDeploymentWatch` RETURNS.
 * A one-level population passed the exact mutation that reinstates the shipped
 * defect. So the population is CLOSED over `return <name>(…)`: a function whose
 * verdict is another function's verdict inherits the obligation, transitively,
 * to a fixed point.
 *
 * The closure follows RETURN POSITIONS ONLY, which is the whole of what
 * propagates an exit code, and is why this is a few lines rather than a call
 * graph. A function called for its side effects cannot carry a verdict out.
 *
 * ⚠️ A BLANKET "NO BARE INTEGER RETURN" RULE WAS TRIED AND REJECTED. Measured
 * across this package it flags a comparator's `return 0`, a page-size
 * `return 50` and a bit shift's `? 0 : 8` — none of them exit codes. A gate
 * whose reds are mostly wrong is a gate somebody loosens, so it is scoped to
 * functions that provably reach the process's status.
 */
const EXIT_PRODUCER_CALL = /process\.exitCode\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
const EXIT_PRODUCER_EXIT = /process\.exit\(\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * Every function whose return value provably becomes this process's status,
 * closed over return-position calls to a fixed point.
 */
function exitProducingFunctions(): readonly string[] {
  const names = new Set<string>();
  for (const file of productionSources()) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const [, name] of source.matchAll(EXIT_PRODUCER_CALL)) names.add(name);
    for (const [, name] of source.matchAll(EXIT_PRODUCER_EXIT)) names.add(name);
  }

  // Fixed point. Bounded by the number of functions in the package, so it
  // terminates even on a cycle — a name already in the set is never re-queued.
  for (let grew = true; grew; ) {
    grew = false;
    for (const name of [...names]) {
      const body = bodyOf(name);
      if (body === null) continue;
      for (const [, called] of body.matchAll(/return\s+(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (!names.has(called) && bodyOf(called) !== null) {
          names.add(called);
          grew = true;
        }
      }
    }
  }

  return [...names].sort();
}

/**
 * EVERY body of `function <name>(…) { … }` in the package, brace-matched.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ALL OF THEM, NOT THE FIRST. RETURNING THE FIRST IS A SILENT COVER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This returned the first match and stopped. No name in this package resolves
 * to two definitions TODAY, so it was correct and would have gone on being
 * correct right up until it wasn't — and then a second `reportFailure`-shaped
 * helper in another file would have been checked by reading the first one, with
 * nothing to see.
 *
 * The sibling lane on `--json` hit precisely this: its ledger keyed on the FILE,
 * so a second `process.exit` in an already-named file was silently covered, and
 * it had to add a second clause counting sites per file. Same hole, keyed on a
 * name instead of a path. Returning every body closes it, and
 * `resolves to exactly one definition` below makes an ambiguous name a RED
 * rather than a coin flip — a gate that cannot tell which definition is called
 * must say so, not pick.
 */
function bodiesOf(name: string): readonly { file: string; body: string }[] {
  const found: { file: string; body: string }[] = [];
  for (const file of productionSources()) {
    const source = codeOnly(readFileSync(file, "utf8"));
    const pattern = new RegExp(`function ${name}\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
      const open = source.indexOf("{", match.index + match[0].length - 1);
      if (open === -1) continue;
      let depth = 0;
      for (let i = open; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            found.push({ file: relative(SRC_DIR, file), body: source.slice(open, i + 1) });
            break;
          }
        }
      }
    }
  }
  return found;
}

/** The single body of `name`, or null when it resolves to none. */
function bodyOf(name: string): string | null {
  return bodiesOf(name)[0]?.body ?? null;
}

describe("no exit-producing function returns a bare integer verdict", () => {
  it("derives a non-empty population of exit-producing functions", () => {
    // Without this the two cases below are vacuously green if the regex rots.
    expect(exitProducingFunctions().length).toBeGreaterThan(0);
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s is resolvable to a definition in this package", (name) => {
    expect({ name, found: bodyOf(name) !== null }).toEqual({ name, found: true });
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s resolves to exactly one definition — an ambiguous name is a red", (name) => {
    // A gate that cannot tell WHICH definition is called must say so rather
    // than pick one. See the header on `bodiesOf`.
    const where = bodiesOf(name).map((found) => found.file);
    expect({ name, definitions: where.length }).toEqual({ name, definitions: 1 });
  });

  it.each(
    eachOrRefuse(
      exitProducingFunctions().map((name) => [name] as const),
      "every function whose return value reaches process.exitCode or process.exit"
    )
  )("%s returns no bare integer, in EVERY definition of it", (name) => {
    const bare = bodiesOf(name).flatMap(({ file, body }) =>
      [
        ...body.matchAll(/return\s+\d+\s*;/g),
        ...body.matchAll(/return[^;\n]*\?\s*\d+\s*:\s*\d+/g)
      ].map(([hit]) => `${file}: ${hit.trim()}`)
    );
    expect({ name, bare }).toEqual({ name, bare: [] });
  });
});
