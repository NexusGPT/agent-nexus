/**
 * THE PROBE-BARRIER GATE — the table is real, and the line it promises is there.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT IT CAN PROVE, AND THE ONE THING IT CANNOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It fails in four directions:
 *
 *   1. a key in {@link PROBE_BARRIER} that names no leaf in the tree  -> RED
 *      (a rename, or a command that was deleted while its warning stayed)
 *   2. a barrier'd leaf whose rendered `--help` omits its line        -> RED
 *      (the walk stopped reaching it — the marker is the whole deliverable)
 *   3. a leaf with NO barrier that carries the line anyway            -> RED
 *      (the marker sprayed everywhere means nothing anywhere)
 *   4. a leaf `COMMAND_CLASSIFICATION` calls `safe` that carries one   -> RED
 *      (the sweep runs `safe` leaves unattended against production, so a `safe`
 *      leaf that costs money is one of the two files being wrong)
 *
 * 🔴 IT CANNOT DEMAND AN ENTRY FOR A NEW BILLED COMMAND. Whether an act spends
 * money is not derivable from a commander tree, and a scan that guessed would
 * be confidently wrong in both directions. Stating that here is deliberate: a
 * gate whose documentation names its hole is worth more than one claiming to
 * have none. The floor that DOES catch a new leaf is
 * `COMMAND_CLASSIFICATION`'s, which refuses a leaf it does not name.
 *
 * ⚠️ EVERY ASSERTION OVER AN EMPTY TREE IS VACUOUSLY TRUE, so the population is
 * floored before any of them runs. A gate reporting a clean pass over nothing is
 * the exact failure this lane exists to delete.
 */

import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  classifyCommandUniverse,
  COMMAND_CLASSIFICATION,
  type CommandDisposition
} from "./command-universe";
import {
  PROBE_BARRIER,
  PROBE_BARRIER_HELP_PREFIX,
  type ProbeBarrierEntry,
  probeBarrierHelpLine
} from "./probe-barrier";
import { buildRootProgram } from "./root-program";

/**
 * The REAL root program, not a rebuild from the registrars.
 *
 * `applyProbeBarrierHelpLine` runs inside `buildRootProgram` after every
 * registrar, so a tree assembled any other way carries none of these lines and
 * every assertion below would pass over a program that is not the CLI. See the
 * header of `probe-barrier.ts` on the docs projection, which has exactly that
 * shape and is green today.
 */
function realLeaves(): ReadonlyMap<string, Command> {
  const leaves = new Map<string, Command>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = command.parent ? [...prefix, command.name()] : [];
    const children = (command.commands as Command[]).filter((c) => c.name() !== "help");

    if (children.length === 0 && path.length > 0) leaves.set(path.join(" "), command);
    for (const child of children) visit(child, path);
  };

  visit(buildRootProgram(), []);
  return leaves;
}

/**
 * The rendered help, exactly as a terminal receives it.
 *
 * `helpInformation()` is NOT this string — it formats usage, arguments, options
 * and subcommands and drops every `addHelpText` block, which is where this line
 * and every `Notes:` block live. Asserting against it would read as a thorough
 * check and would be blind to the entire surface under test.
 */
function renderedHelp(command: Command): string {
  let buffer = "";
  const previous = { ...command.configureOutput() };
  command.configureOutput({
    writeOut: (text: string) => {
      buffer += text;
    },
    writeErr: () => {}
  });
  try {
    command.outputHelp();
  } finally {
    command.configureOutput(previous);
  }
  return buffer;
}

/**
 * Every disposition `sweep.sh` runs against a live API with no operator
 * watching. MODULE SCOPE on purpose: the meta-test below has to READ this, and
 * a copy inside the assertion is a copy that can be narrowed while a test
 * asserting about "the list" stays green.
 */
const EXECUTED_UNATTENDED: readonly CommandDisposition[] = ["safe", "safe-with-fixture"];

describe("probe barrier", () => {
  const leaves = realLeaves();
  const entries = Object.entries(PROBE_BARRIER) as Array<[string, ProbeBarrierEntry]>;

  it("has a population to assert over", () => {
    // Both floors, because either one being empty makes everything below vacuous.
    expect(leaves.size).toBeGreaterThan(400);
    expect(entries.length).toBeGreaterThan(80);
  });

  it("names only commands that exist — a stale key is a rename, never a deletion", () => {
    const stale = entries.map(([path]) => path).filter((path) => !leaves.has(path));
    expect(stale).toEqual([]);
  });

  it("puts each barrier'd leaf's own line into its rendered help", () => {
    const missing = entries
      .filter(([path, entry]) => {
        const command = leaves.get(path);
        // The stale arm above owns the absent case; this arm must not swallow it.
        return (
          command !== undefined && !renderedHelp(command).includes(probeBarrierHelpLine(entry))
        );
      })
      .map(([path]) => path);

    expect(missing).toEqual([]);
  });

  it("puts the line on NOTHING else — a marker everywhere marks nothing", () => {
    const spurious = [...leaves]
      .filter(([path]) => PROBE_BARRIER[path] === undefined)
      .filter(([, command]) => renderedHelp(command).includes(PROBE_BARRIER_HELP_PREFIX))
      .map(([path]) => path);

    expect(spurious).toEqual([]);
  });

  it("never marks a leaf the sweep executes unattended", () => {
    // "Executed unattended" is the property, and it is NOT the single word
    // `safe`. sweep.sh runs every EXECUTABLE disposition against a live API with
    // no operator watching, so this filter has to name all of them.
    //
    // 🚨 IT NAMED ONE, AND THE DAY A SECOND WAS ADDED THIS GATE WENT QUIETLY
    // HALF-BLIND. `safe-with-fixture` is executed exactly like `safe`; a leaf
    // that spends money or reaches a third party, marked with it, passed this
    // assertion while still being run unattended on every CLI PR. The same
    // widening was done to `command-universe.test.ts` in the same change and
    // this sibling was missed — bugbot caught it.
    //
    const contradictions = entries
      .map(([path]) => path)
      .filter((path) => EXECUTED_UNATTENDED.includes(COMMAND_CLASSIFICATION[path]));

    expect(contradictions).toEqual([]);
  });

  it("covers EVERY disposition the sweep executes, read from the sweep's own list", async () => {
    // 🚨 THE FIRST VERSION OF THIS TEST WAS VACUOUS, AND BUGBOT CAUGHT IT. It
    // re-filtered `COMMAND_CLASSIFICATION` with the same hardcoded pair and
    // asserted those two values appeared — so narrowing `EXECUTED_UNATTENDED`
    // back to `"safe"` alone left it GREEN, and the half-blindness it existed to
    // lock out could return unnoticed. A guard that does not read the thing it
    // guards is not a weaker guard; it is decoration.
    //
    // The ground truth is `classifyCommandUniverse().safe` — that list IS what
    // sweep.sh executes, derived from the real commander tree. Every disposition
    // appearing in it must be covered by `EXECUTED_UNATTENDED`, or the barrier
    // check above is blind to leaves the sweep genuinely runs.
    const { safe } = await classifyCommandUniverse();
    expect(safe.length).toBeGreaterThan(0);

    const executed = new Set(safe.map((path) => COMMAND_CLASSIFICATION[path]));
    expect(executed.size).toBeGreaterThan(0);

    const uncovered = [...executed].filter(
      (disposition) => !EXECUTED_UNATTENDED.includes(disposition)
    );

    expect(
      uncovered,
      `sweep.sh executes ${uncovered.join(", ")}, which the barrier check above does not name`
    ).toEqual([]);
  });

  it("says what it costs and what to do instead, in the one line the walk installs", () => {
    // Against the exported builder, never a second copy of the sentence: a test
    // carrying its own copy lets the real line be reworded into uselessness with
    // this file still green.
    const line = probeBarrierHelpLine({
      barrier: "money",
      why: "purchases a number from the carrier",
      safeCheck: "`phone-number search` lists purchasable numbers without buying one"
    });

    expect(line).toContain("MONEY");
    expect(line).toContain("purchases a number from the carrier");
    expect(line).toContain("UNVERIFIED");
    expect(line).toContain("phone-number search");

    // A barrier with no free alternative must not invent one.
    expect(probeBarrierHelpLine({ barrier: "setup", why: "needs a connection" })).not.toContain(
      "Safe check"
    );
  });
});
