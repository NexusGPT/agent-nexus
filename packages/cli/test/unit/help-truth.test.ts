import assert from "node:assert/strict";
import { before, test } from "node:test";

import { deriveCommandNamespaces } from "../../src/command-universe";
import {
  CLEAN_NAMESPACES,
  HELP_TRUTH_LEDGER,
  LEDGER_CEILING,
  NAMESPACE_TOTAL
} from "./help-truth.ledger";
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
let namespaces: string[];

before(async () => {
  report = await runHelpTruthScan();
  derived = await deriveCommandLeaves();
  namespaces = (await deriveCommandNamespaces()).map((ns) => ns.name).sort();
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

test("CONTROL: R4 was proved to have JUDGED, not merely to have run", () => {
  // The same shape as the R5b counter above, aimed at the rule that decides
  // whether a namespace is clean.
  //
  // R4 declines to judge a path operand on three grounds — a placeholder value,
  // a `name or` argument the CLI resolves client-side, and a route whose
  // PathVars arity does not match. All three produce NO violation, which is
  // byte-for-byte what "asked and found nothing" produces. Measured 2026-08-15,
  // before this counter existed: across the tree R4 skipped 146 operands and the
  // whole gate was green, with `agent-eval` certified clean on 0 judged / 32
  // skipped and `conversation` on 1 / 28.
  //
  // 462 judged against 97 skipped when this landed, tree-wide. The floor is 150
  // so ordinary movement does not redden it and only a broken loop can cross it.
  const judged = Object.values(report.pathOperandsJudged).reduce((a, b) => a + b, 0);
  assert.ok(
    judged > 150,
    `R4 judged only ${judged} path operands — it is not running, or every example ` +
      `stopped naming an id. Skipped: ${Object.values(report.pathOperandsSkipped).reduce((a, b) => a + b, 0)}`
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
// PROGRAMME PROGRESS — one place that answers "how far along is this"
//
// The ledger arms above are about DEFECTS: which commands are broken, and is
// every one of them written down. None of them answers the programme's own
// question, and before these two arms nothing did — `CLEAN_NAMESPACES.length`
// was a numerator with no denominator, and `LEDGER 6` only stopped it going
// DOWN, so it was a floor rather than a measurement.
//
// Three arms make the fraction honest, and it takes all three:
//
//   PROGRESS 1 pins the DENOMINATOR to the live commander tree.
//   PROGRESS 2 forces the NUMERATOR to be COMPLETE  — every clean namespace is in.
//   PROGRESS 3 forces the NUMERATOR to be SOUND     — nothing else is.
//
// 2 and 3 are separate because they fail in opposite directions and neither
// implies the other: without 2 the ratio reads LOW, without 3 it reads HIGH, and
// a numerator that can only be bounded on one side is not a measurement.
//
// With all three, `CLEAN_NAMESPACES.length / NAMESPACE_TOTAL` is the progress of
// the `--help` completeness programme, in the repository, checkable by CI.
// ─────────────────────────────────────────────────────────────────────────────

test("PROGRESS 1: the denominator is the live tree, so the ratio cannot rot", () => {
  // A hand-written count beside an evolving CLI is the defect this whole gate
  // was built to delete, and it grew back in prose: a `because:` string in
  // contract-help.namespaces.ts said "64 top-level names are 46 namespaces"
  // while the tree said 65 and 47, and this file's own ledger said "six of the
  // seven" over a six-entry list. Prose cannot go red. This can.
  assert.equal(
    namespaces.length,
    NAMESPACE_TOTAL,
    `\n\nthe CLI registers ${namespaces.length} visible namespaces, NAMESPACE_TOTAL says ${NAMESPACE_TOTAL}.\n` +
      `A namespace was added or removed. Update NAMESPACE_TOTAL in help-truth.ledger.ts\n` +
      `in the same change, so the programme's denominator moves where a reviewer reads it.\n\n` +
      `  live: ${namespaces.join(", ")}`
  );
});

test("PROGRESS 2: a namespace that became clean is recorded as clean", () => {
  // The converse of LEDGER 6, and the arm that turns the list into a
  // measurement. Without it, fixing a namespace's last defect is invisible: the
  // ledger shrinks, no test notices, and the recorded numerator stays behind the
  // real one. That is exactly what had happened to the four names this arm
  // forced into the list.
  //
  // NOT true by construction — CLEAN_NAMESPACES is still hand-written. This
  // makes the edit MANDATORY, it does not make it automatic.
  const observed = observedLedger();
  const hasDefect = (ns: string): boolean =>
    [...observed.keys()].some((c) => c === ns || c.startsWith(`${ns} `));

  const undeclared = namespaces.filter((ns) => !hasDefect(ns) && !CLEAN_NAMESPACES.includes(ns));
  assert.deepEqual(
    undeclared,
    [],
    `\n\n${undeclared.length} namespace(s) have no --help defect and are not recorded as clean:\n` +
      `${undeclared.map((ns) => `  ${ns}`).join("\n")}\n\n` +
      `Add each to CLEAN_NAMESPACES in help-truth.ledger.ts. Until then the programme's\n` +
      `progress reads lower than it is, and nothing else in the repository can tell.`
  );
});

test("PROGRESS 3: every namespace recorded as clean still exists", () => {
  // The third side, and without it the other two do not add up to a ratio.
  //
  // PROGRESS 2 forces live-and-clean INTO the list. Nothing forced the list to
  // hold only live namespaces, and every existing arm is blind to a name that
  // is not one: LEDGER 6 asks whether a declared name holds a ledger entry, and
  // a namespace that does not exist holds none, so it passes as CLEAN. So a
  // deleted namespace left behind here, or a typo that ADDS rather than
  // replaces, inflates the numerator while the whole gate stays green — the
  // ratio reads as measured and is not.
  //
  // (A typo that REPLACES a name is already caught, by PROGRESS 2: the real
  // namespace becomes clean-and-undeclared. Only the additive case gets through,
  // which is exactly why this arm is separate rather than folded in.)
  //
  // This is LEDGER 4's shape applied to the numerator: a ghost name must be
  // deleted, never carried.
  const ghosts = CLEAN_NAMESPACES.filter((ns) => !namespaces.includes(ns));
  assert.deepEqual(
    ghosts,
    [],
    `\n\n${ghosts.length} name(s) in CLEAN_NAMESPACES are not namespaces the CLI registers:\n` +
      `${ghosts.map((ns) => `  ${ns}`).join("\n")}\n\n` +
      `A renamed namespace needs its name changed; a deleted one needs its line deleted.\n` +
      `Until then CLEAN_NAMESPACES.length overstates the programme's progress.`
  );

  // The ratio itself, printed so a CI log carries the answer rather than only
  // (see PROGRESS 4 below for the arm that makes each name in it mean something)
  // the verdict. A gate that proves the number and never shows it makes the
  // reader go and derive it again. Printed HERE, from the last of the three
  // arms, so the number is only ever emitted once all three have held.
  const clean = CLEAN_NAMESPACES.length;
  console.log(
    `    PROGRESS: ${clean}/${NAMESPACE_TOTAL} namespaces clean ` +
      `(${((clean / NAMESPACE_TOTAL) * 100).toFixed(0)}%) — ` +
      `${report.violations.length} violations across ${observedLedger().size} commands, ` +
      `${report.leafCount} leaves`
  );
});

test("PROGRESS 4: a namespace declared clean was MEASURED, not abstained on", () => {
  // The fourth side, and the one that makes CLEAN a result rather than a
  // silence. LEDGER 6 and PROGRESS 2 and 3 all reason about the ABSENCE of a
  // ledger entry. Absence is produced by two completely different events — R4
  // asked its question and the answer was fine, or R4 never asked — and none of
  // the other three arms can tell them apart.
  //
  // So: a namespace that ships path operands in format-constrained slots must
  // have had at least one of them actually put to the route's schema. A
  // namespace with no such operand at all (`model`, `upgrade`, `docs`) is
  // exempt by construction, because there is nothing there to judge and
  // demanding a judgement would be a rule that cannot be satisfied.
  const abstained = CLEAN_NAMESPACES.filter((ns) => {
    const judged = report.pathOperandsJudged[ns] ?? 0;
    const skipped = report.pathOperandsSkipped[ns] ?? 0;
    return judged === 0 && skipped > 0;
  }).sort();

  assert.deepEqual(
    abstained,
    [],
    `\n\n${abstained.length} namespace(s) are recorded CLEAN and R4 never judged one of their\n` +
      `path ids — every operand they ship was waved through:\n` +
      abstained
        .map((ns) => `  ${ns}: 0 judged, ${report.pathOperandsSkipped[ns] ?? 0} skipped`)
        .join("\n") +
      `\n\nThat is a clean result worn by an instrument that read nothing, which is the\n` +
      `failure this whole ledger exists to prevent. Give at least one example per\n` +
      `namespace a real id — then the clean verdict is about the help, not about the\n` +
      `scan declining to look at it.`
  );

  // ⚠️ THE EXEMPTION IS NOT A CLEAN BILL, SO IT IS PRINTED RATHER THAN ASSUMED.
  // A namespace at 0 judged AND 0 skipped had no path id put to a schema, and for
  // those names CLEAN means "R0/R1 found nothing", never "the ids were checked".
  //
  // 🚨 THIS USED TO BE ONE LIST AND ONE NUMBER, AND THAT WAS THE DEFECT. Four
  // unrelated causes produce the identical 0/0 state, and printing their union
  // made a reporting artefact read as a contract-coverage programme: the line
  // said "16 blind" when ten of the sixteen were correct and permanent and no
  // work would ever move them. A reader had to subtract ten from a number nobody
  // printed. The old line also derived blindness from the counters alone, while
  // the scan had recorded the REASON for every unresolved command all along —
  // it simply never consulted it.
  //
  // So the permanent causes are reported as SATISFIED and never counted in a gap
  // total. Only `SDK-BYPASS` and `NO-DESCRIPTOR` are work, and each names what
  // would actually close it.
  const blind = CLEAN_NAMESPACES.filter(
    (ns) =>
      (report.pathOperandsJudged[ns] ?? 0) === 0 && (report.pathOperandsSkipped[ns] ?? 0) === 0
  ).sort();

  const of = (kind: string): string[] =>
    blind.filter((ns) => report.namespaceBlindness[ns] === kind);
  const noRoute = of("NO-ROUTE");
  const unreached = of("UNREACHED");
  const bypass = of("SDK-BYPASS");
  const noDescriptor = of("NO-DESCRIPTOR");
  const permanent = [...noRoute, ...unreached].sort();
  const addressable = [...bypass, ...noDescriptor].sort();

  // Every blind namespace must land in exactly one bucket. An unclassified one
  // would silently vanish from both totals, which is the failure this replaces.
  const unclassified = blind.filter((ns) => report.namespaceBlindness[ns] === undefined);
  assert.deepEqual(
    unclassified,
    [],
    `\n\n${unclassified.length} blind namespace(s) got no classification, so they are in ` +
      `neither total:\n  ${unclassified.join(", ")}\n\n` +
      `Every 0-judged/0-skipped namespace has a cause. A missing one means the ` +
      `classifier stopped covering a shape the tree still contains.`
  );

  // THE POINT OF THE SPLIT, ASSERTED RATHER THAN LEFT TO THE SHAPE OF THE CODE.
  // A permanently blind namespace counted in a gap total is the exact defect this
  // replaces, and two arrays built next to each other is not a guarantee — one
  // careless concat restores it silently and the log still looks organised.
  // CONTROL: the SDK-BYPASS detector RAN. Without this, a regex that stops
  // matching empties the gap bucket and every namespace it held is reported as
  // correct and permanent — the gap total reads 0 and looks like finished work.
  // 6 resolved when this landed; the floor is 1 because it is proving the arm is
  // alive, not pinning a number that moves whenever a command is rewired.
  assert.ok(
    report.transportRoutesResolved > 0,
    `the raw-transport scan resolved no v1 route at all, so SDK-BYPASS cannot be ` +
      `detected and its namespaces are being reported as permanently blind`
  );

  const leaked = permanent.filter((ns) => addressable.includes(ns));
  assert.deepEqual(
    leaked,
    [],
    `\n\n${leaked.length} namespace(s) are counted as BOTH permanent and a gap:\n` +
      `  ${leaked.join(", ")}\n\nA namespace with no route, or with routes that carry no ` +
      `id, cannot be "fixed". Counting it as work is what made 16 blind read as 16 to do.`
  );

  if (permanent.length > 0) {
    console.log(
      `    NO PATH ID TO CHECK — correct and permanent (${permanent.length}): ${permanent.join(", ")}`
    );
    if (noRoute.length > 0)
      console.log(`      NO-ROUTE  reaches no v1 route: ${noRoute.join(", ")}`);
    if (unreached.length > 0)
      console.log(`      UNREACHED routes resolve, no id in the path: ${unreached.join(", ")}`);
  }
  if (addressable.length === 0) {
    console.log(`    CONTRACT GAP: none — every blind namespace is blind by construction`);
    return;
  }
  console.log(`    CONTRACT GAP (${addressable.length}) — these could be checked and are not:`);
  if (bypass.length > 0)
    console.log(`      SDK-BYPASS    contract exists, CLI skips the SDK: ${bypass.join(", ")}`);
  if (noDescriptor.length > 0)
    console.log(`      NO-DESCRIPTOR an SDK route the contract omits: ${noDescriptor.join(", ")}`);
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
