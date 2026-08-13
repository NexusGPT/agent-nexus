import assert from "node:assert/strict";
import { before, test } from "node:test";

import { CLEAN_NAMESPACES, HELP_TRUTH_LEDGER, LEDGER_CEILING } from "./help-truth.ledger";
import { deriveCommandLeaves, runHelpTruthScan, type ScanReport } from "./help-truth-rules";

/**
 * THE `--help` TRUTH GATE — every namespace, every command, one shrink-only ledger.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES, AND WHY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `src/commands/help-completeness.test.ts` policed the same shape against a
 * hand-written `CONVERTED_NAMESPACES` list and reached 6 namespaces of 46. A
 * list beside an evolving CLI is the defect, not the coverage: it goes stale in
 * silence, and a gate over a stale list reads exactly like a gate over a
 * complete one. That file is deleted and its two claims — an Examples block and
 * a Notes block on every leaf — are rules R0 here, over all 500 leaves.
 *
 * ⚠️ THREE FILES ARE DELIBERATELY LEFT ALONE, against the brief that ordered
 * them subsumed. `src/commands/knowledge-help-completeness.test.ts`,
 * `help-completeness-credentials.test.ts` and `role-coverage-help-is-true.test.ts`
 * do not restate a Zod contract; they pin BEHAVIOURAL warnings measured against
 * the running backend — a 2xx that records nothing, a poll that never
 * terminates, a delete that cascades. No schema encodes any of that, so nothing
 * here can derive it and deleting them would remove protection this gate cannot
 * replace. `test/unit/help-completeness.test.ts` likewise keeps its
 * enum-COVERAGE assertions ("the help must NAME every status"), which are a
 * different claim from "every example is runnable".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE CONTROLS COME FIRST, AND THEY ARE THE POINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every rule iterates a discovered population, and every assertion over an empty
 * population is VACUOUSLY TRUE. A regex that stops matching, a moved directory,
 * a renamed export — each yields zero commands, zero examples, zero violations,
 * and a green build that proves nothing. So the floors below run first and are
 * as load-bearing as the rules: they make the gate REFUSE where it would
 * otherwise DEGRADE.
 *
 * The counts are floors, not equalities, so ordinary growth does not redden
 * them; each sits far enough below today's measurement that only a broken scan
 * can cross it.
 */

let report: ScanReport;
let derived: string[];

before(async () => {
  report = await runHelpTruthScan();
  derived = await deriveCommandLeaves();
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — a broken scan must refuse, never pass over nothing
// ─────────────────────────────────────────────────────────────────────────────

test("CONTROL: the population is the whole CLI, not a fragment of it", () => {
  assert.ok(report.leafCount > 400, `only ${report.leafCount} leaves — the walk is broken`);
  assert.ok(report.nodeCount > 500, `only ${report.nodeCount} nodes — the walk is broken`);
});

test("CONTROL: this gate and command-universe see the SAME command set", () => {
  // Two consumers of one derivation. If they ever disagree, one of them is
  // reading a tree the CLI does not ship, and neither can say which — so the
  // disagreement itself is the finding.
  assert.deepEqual(
    [...report.leaves],
    derived,
    "help-truth and command-universe derived different leaf sets"
  );
});

test("CONTROL: every command was located in its own source file", () => {
  // The route arm reads each command's source slice, keyed on the stack frame of
  // its `.command()` call. A command with no located file is invisible to rules
  // 2-4 — and would be invisible SILENTLY.
  assert.equal(
    report.locatedNodes,
    report.nodeCount,
    `${report.nodeCount - report.locatedNodes} commands could not be tied to a source line`
  );
});

test("CONTROL: the rule that reports zero was proved to have run", () => {
  // R5b — "a required option named in no example" — finds nothing today, and it
  // is RIGHT to: R1 already refuses an example that omits a required option, so
  // on a tree where R1 is clean R5b is entailed. A rule that is entailed and a
  // rule that was never reached print the identical zero, and only one of them
  // is protection. This is the counter that separates them.
  // 98 when this landed. The floor is 50 so ordinary movement does not redden
  // it and only a broken loop can cross it — a threshold set at the measurement
  // is a threshold that fails on the next commit and gets raised without being
  // read.
  assert.ok(
    report.requiredOptionsExamined > 50,
    `R5b examined only ${report.requiredOptionsExamined} required options — it is not running`
  );
  assert.ok(
    report.registrarCount > 40,
    `command-universe discovered only ${report.registrarCount} root registrars`
  );
  assert.ok(
    report.globalOptionCount >= 6,
    `the root program declares only ${report.globalOptionCount} options; without the globals ` +
      `every example using --json reads as a defect`
  );
});

test("CONTROL: the examples, the contracts and the SDK routes were all read", () => {
  assert.ok(report.examplesChecked > 800, `only ${report.examplesChecked} examples parsed`);
  assert.ok(report.descriptorCount > 300, `only ${report.descriptorCount} v1 descriptors read`);
  assert.ok(report.sdkRouteCount > 200, `only ${report.sdkRouteCount} SDK routes resolved`);
  assert.ok(
    report.routesResolved > 200,
    `only ${report.routesResolved} commands resolved to a route — rules 2-4 are nearly blind`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER — four directions
// ─────────────────────────────────────────────────────────────────────────────

/** The live scan, folded into the ledger's own shape. */
function observedLedger(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of report.violations) {
    const keys = out.get(v.command) ?? [];
    keys.push(v.key);
    out.set(v.command, keys);
  }
  for (const [k, keys] of out) out.set(k, [...new Set(keys)].sort());
  return out;
}

/** The first lines of detail for one command, so a red is readable. */
function detailFor(command: string): string {
  return report.violations
    .filter((v) => v.command === command)
    .map((v) => `      · ${v.key}\n        ${v.detail.split("\n").join("\n        ")}`)
    .join("\n");
}

test("LEDGER 1: no command fails a rule without being written down", () => {
  const observed = observedLedger();
  const unledgered = [...observed.keys()].filter((c) => HELP_TRUTH_LEDGER[c] === undefined).sort();
  assert.deepEqual(
    unledgered,
    [],
    `\n\n${unledgered.length} command(s) have a --help defect and no ledger entry.\n` +
      `Fix the help. Only if the defect is genuinely being deferred, add the entry AND\n` +
      `raise LEDGER_CEILING in the same change.\n\n` +
      unledgered.map((c) => `  ${c}\n${detailFor(c)}`).join("\n\n")
  );
});

test("LEDGER 2: an entry whose command is now clean must be deleted", () => {
  const observed = observedLedger();
  const stale = Object.keys(HELP_TRUTH_LEDGER)
    .filter((c) => report.leaves.includes(c) || observed.has(c))
    .filter((c) => !observed.has(c))
    .sort();
  assert.deepEqual(
    stale,
    [],
    `\n\n${stale.length} ledger entr(y/ies) record a defect that no longer reproduces.\n` +
      `Delete the line — a stale exemption is as bad as a missing one, because it is\n` +
      `read as "this is known to be broken" by everyone who meets it.\n\n` +
      stale.map((c) => `  ${c}`).join("\n")
  );
});

test("LEDGER 3: a command's recorded defects must equal its actual ones", () => {
  // Both directions in one comparison. A key that APPEARED is a new defect on a
  // command that already had one — the shape a per-command allowlist misses. A
  // key that VANISHED is a fix nobody wrote down, and leaving it recorded
  // re-permits the defect the day it comes back.
  const observed = observedLedger();
  const drifted: string[] = [];
  for (const [command, keys] of observed) {
    const recorded = HELP_TRUTH_LEDGER[command];
    if (recorded === undefined) continue; // LEDGER 1 owns that case
    const want = [...recorded].sort();
    if (JSON.stringify(want) === JSON.stringify(keys)) continue;
    const added = keys.filter((k) => !want.includes(k));
    const gone = want.filter((k) => !keys.includes(k));
    drifted.push(
      `  ${command}\n` +
        (added.length ? `    NEW  (fix these): ${added.join(", ")}\n` : "") +
        (gone.length ? `    FIXED (delete these): ${gone.join(", ")}\n` : "") +
        (added.length ? detailFor(command) : "")
    );
  }
  assert.deepEqual(
    drifted,
    [],
    `\n\n${drifted.length} ledger entr(y/ies) drifted.\n\n${drifted.join("\n")}`
  );
});

test("LEDGER 4: an entry naming a command that no longer exists must be deleted", () => {
  const live = new Set(report.leaves);
  const observed = observedLedger();
  const ghosts = Object.keys(HELP_TRUTH_LEDGER)
    .filter((c) => !live.has(c) && !observed.has(c))
    .sort();
  assert.deepEqual(
    ghosts,
    [],
    `\n\n${ghosts.length} ledger entr(y/ies) name a command the CLI no longer registers.\n` +
      `A renamed command needs its key renamed; a deleted one needs its line deleted.\n\n` +
      ghosts.map((c) => `  ${c}`).join("\n")
  );
});

test("LEDGER 5: the ceiling holds, so adding an entry costs a visible second edit", () => {
  const total = report.violations.length;
  assert.ok(
    total <= LEDGER_CEILING,
    `\n\nthe scan found ${total} violations against a ceiling of ${LEDGER_CEILING}.\n` +
      `Fix the help. Raising the ceiling is the deliberate alternative, and it is\n` +
      `meant to be read in the diff.`
  );
});

test("LEDGER 6: a namespace declared clean holds no entry at all", () => {
  // Written out in the ledger, never derived: derived, this assertion would be
  // true by construction. It is the arm the per-command ones cannot supply —
  // re-opening a closed namespace needs an edit here, where it is conspicuous.
  const dirty = CLEAN_NAMESPACES.filter((ns) =>
    Object.keys(HELP_TRUTH_LEDGER).some((c) => c === ns || c.startsWith(`${ns} `))
  );
  assert.deepEqual(
    dirty,
    [],
    `\n\nnamespace(s) declared clean now hold ledger entries: ${dirty.join(", ")}.\n` +
      `Fix the help rather than removing the name.`
  );

  const observed = observedLedger();
  const regressed = CLEAN_NAMESPACES.filter((ns) =>
    [...observed.keys()].some((c) => c === ns || c.startsWith(`${ns} `))
  );
  assert.deepEqual(
    regressed,
    [],
    `\n\nnamespace(s) declared clean have regressed: ${regressed.join(", ")}.\n\n` +
      regressed.map((ns) => detailFor(ns)).join("\n")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// THE BLIND SPOT, REPORTED RATHER THAN HIDDEN
// ─────────────────────────────────────────────────────────────────────────────

test("the contract arm's reach is bounded and does not silently shrink", () => {
  // Rules 2-4 see only the commands whose route resolves. That number is a
  // property of the CLI and the SDK, not of this gate, and it moving DOWN means
  // the gate went blind somewhere without anything else changing. Reported as a
  // floor so a refactor that breaks resolution is loud.
  const withExamples = report.routesResolved + report.routesUnresolved;
  assert.ok(withExamples > 400, `only ${withExamples} commands carry an example`);
  assert.ok(
    report.routesResolved / withExamples > 0.6,
    `only ${report.routesResolved}/${withExamples} commands resolved to a v1 route ` +
      `(${report.unresolvedNoSdkCall} name no client.<resource>.<method> call, ` +
      `${report.unresolvedNoDescriptor} name one with no v1 descriptor)`
  );
});
