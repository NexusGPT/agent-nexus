/**
 * A DECLARED PENDING-DEPLOY ROUTE IS ACCEPTED ONCE, AND THE ACCEPTANCE RETIRES
 * ITSELF — EXECUTED HERE, NOT READ.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROTECTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-sweep` builds the CLI from the PULL REQUEST's own sources and sweeps it
 * against the DEPLOYED staging API. Those are two trees, so a branch adding a CLI
 * noun AND the route it calls is red from the moment it opens: the leaf is
 * genuinely `safe`, the command is correct, and the environment has no such route.
 * `SWEEP_ROUTES_PENDING_DEPLOY` names that absence per leaf, bound to the exact
 * path, and `scripts/route-not-deployed.sh` is the matcher.
 *
 * Every mechanism in that family has exactly one failure that matters and it is
 * not the missing declaration. A missing one is LOUD — the leaf goes red and
 * somebody looks. A declaration that accepts MORE than one named absence is
 * silent and permanent, and so is one that outlives its reason. So the cases
 * below are lopsided on purpose: ONE proves the declared absence is accepted, and
 * the rest prove that nothing which merely resembles it is.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE ARM THAT MAKES THIS DIFFERENT FROM A SKIP: STALE IS A FAILURE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A stale `SWEEP_EXPECTED_SKIPS` entry is REPORTED and fails nothing, on the
 * stated grounds that a gate reddening on good news gets its declarations deleted
 * rather than its news read. A stale pending-deploy entry FAILS, and the
 * asymmetry is argued where the declaration lives: an environment policy lifts by
 * somebody else's hand at any time, while an undeployed route in THIS branch's
 * diff expires exactly once, at a deploy the declaring lane performed.
 *
 * The cost of the other direction is measured in this very tree, which is why the
 * mechanism exists at all rather than a fourth hand-written comment. `tracks
 * list` sits parked at `registration-only` behind a block comment naming the
 * probe that would promote it. Measured 2026-10-07 against the deployed staging
 * API: `/api/public/v1/tracks` answers **401** — the route is live — while a path
 * nobody has ever registered answers **404**, and `/api/public/v1/mcp-servers`
 * answers 404 too. The promotion condition in that comment has been met for some
 * time, the leaf is still unswept, and nothing anywhere went red. A comment is
 * not a mechanism; `stale` is the case this file exists for.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW IT RUNS WITH NO CREDENTIAL, NO TENANT AND NO NETWORK CALL OF ITS OWN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The same rig `sweep-promotes-warn-only-under-strict.test.ts` uses, and for the
 * same reason: `sweep.sh` reads `NEXUS_BIN` and splits it into an argv array, so
 * `test/fixtures/nexus-stub.sh` IS the CLI as far as the sweep can tell. The
 * sweep still derives its own population from `src/command-universe.ts` and still
 * runs its own preflight — only the responses are substituted.
 *
 * Every leaf and every path below is DERIVED from `classifyCommandUniverse()`,
 * never named here, so a renamed leaf or a retired declaration cannot leave this
 * file quietly asserting about a CLI that no longer exists. The one literal is
 * the sibling path used to build a 404 that names something else, and it is built
 * FROM the declared path rather than typed.
 *
 * ⚠️ WHAT THIS CANNOT DO. It never calls the live API, so it cannot prove today's
 * staging emits this sentence — the measurement above is the evidence for that,
 * and the `Cannot <VERB> <path>` half is an English sentence owned by
 * `apps/backend` which `packages/cli` is mirrored away from and may not assert.
 * A backend reword re-reds the gate silently; the coupling is documented, not
 * enforced, exactly as `policy-refusal.sh` says of its own phrases.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY EVERY CASE ASSERTS AN EXACT CODE AND THE PRESENCE OF `Summary:`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sweep's REFUSALS share a number space with its FAIL count: 2 unknown arg,
 * 3 binary unavailable, 4 not authenticated, 5/6/7 a derivation failed, 8 the
 * policy matcher could not be sourced, 9 the route matcher could not be sourced,
 * 10 the pending-deploy derivation failed. So `toBeGreaterThan(0)` is satisfied
 * by a sweep that never reached a leaf. `summaryOf` THROWS rather than
 * defaulting: a refusal prints `FATAL:` and no summary at all.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  classifyCommandUniverse,
  staleDeclarations,
  SWEEP_ROUTES_PENDING_DEPLOY
} from "./command-universe";

/**
 * 🚨 THE END-TO-END ARMS BELOW CANNOT RUN WITH NO DECLARATION, AND NOTHING IN
 * THIS PACKAGE CAN GIVE THEM ONE.
 *
 * An entry in {@link SWEEP_ROUTES_PENDING_DEPLOY} fires exactly once, at a
 * deploy, and the remedy for its own good news is to DELETE it — so an EMPTY map
 * is this mechanism's resting state rather than a gap. The six arms that drive a
 * real `sweep.sh` need a leaf/route pairing, and the sweep derives that pairing
 * itself: `run_universe()` is a hard-coded
 * `pnpm exec tsx scripts/command-universe.ts`, which reads this module and no
 * environment variable. So the pairing has to be IN the module; there is no seam,
 * and the three shapes that look like one are each worse than dormancy:
 *
 *   - an env override on the derivation would let a run be handed a declaration
 *     that appears in NO DIFF. The whole design rests on a declaration being a
 *     reviewable entry that self-retires, so a traceless one is an amnesty.
 *   - a permanent self-test entry for a coined leaf is caught by
 *     {@link staleDeclarations} — the leaf is not swept — which is the drift guard
 *     working, and silencing it would cost more than these arms.
 *   - driving a COPY of `sweep.sh` from a scratch tree makes the subject a
 *     replica of the thing under test, which is the one substitution that can
 *     drift from the shipping file in silence.
 *
 * ✅ SO THEY SKIP, BY A DERIVED CONDITION, AND THE COST IS STATED RATHER THAN
 * HIDDEN. A named skip is visible in the runner's output; a floor would red the
 * file on the day the last entry correctly retires, and softening each arm to
 * pass over an empty map would be the vacuous green this whole family exists to
 * refuse. What stays LIVE at rest is every source-level wiring arm, the drift
 * arms below, and the matcher's full accept/refuse contract in
 * `sweep-route-absence-matches-one-declared-path.test.ts`, which is decoupled
 * from this map for exactly that reason.
 *
 * ⚠️ WHAT THE DORMANCY COSTS, MEASURED: a regression in `sweep.sh`'s
 * pending-deploy arm — STALE no longer reddening, or a 401 absorbed as PENDING —
 * lands green while the map is empty, and surfaces as a red on the next lane to
 * declare a route, reading as that lane's own defect. The arms wake with the next
 * entry, which is the first run on which they have anything to say.
 */
const HAS_DECLARATION = Object.keys(SWEEP_ROUTES_PENDING_DEPLOY).length > 0;

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const STUB = join(PACKAGE_ROOT, "test", "fixtures", "nexus-stub.sh");
const MATCHER = join(PACKAGE_ROOT, "scripts", "route-not-deployed.sh");
const MATCHER_SOURCE = readFileSync(MATCHER, "utf8");
const SWEEP_SOURCE = readFileSync(SWEEP, "utf8");

interface Outcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface Conditions {
  /** `leaf<TAB>path` lines — the stub answers each leaf with a 404 naming THAT path. */
  readonly routeMissing?: string;
  readonly fail?: readonly string[];
  readonly unauth?: readonly string[];
}

/** Derived, never named. */
let declaredSkips: readonly string[] = [];
let pendingLeaf = "";
let pendingRoute = "";
let pendingCause = "";
/** A swept leaf carrying NO declaration of either kind — the undeclared control. */
let undeclaredLeaf = "";

const outcomes = new Map<string, Outcome>();

beforeAll(async () => {
  const universe = await classifyCommandUniverse();
  declaredSkips = universe.expectedSkips;

  const declaration = universe.pendingDeploy[0];
  if (declaration === undefined) return;
  pendingLeaf = declaration.path;
  pendingRoute = declaration.route;
  pendingCause = declaration.cause;

  const pendingPaths = universe.pendingDeploy.map(({ path }) => path);
  undeclaredLeaf =
    universe.safe.find((leaf) => !declaredSkips.includes(leaf) && !pendingPaths.includes(leaf)) ??
    "";
  if (undeclaredLeaf === "") return;

  // Every declaration answered the way the deployed API answers it. The HEALTHY
  // shape, and the baseline the other configurations are read against.
  const asDeclared = universe.pendingDeploy
    .map(({ path, route }) => `${path}\t${route}`)
    .join("\n");

  // ── FOUR runs, and both the count and the ORDER of execution are bounded ──
  //
  // 🔴 EACH RUN IS A REAL SWEEP: ~65 CLI leaves through a stub, so ~130 process
  // spawns apiece. Six here plus five in the exit-policy spec put ELEVEN in one
  // `vitest run`, and that starved the longest file in the package —
  // `test/id-thread/id-thread-sweep.test.ts`, whose 84 spawns stretched from a
  // measured 64s alone to 312s in CI and ended the run
  // `Timeout calling "onTaskUpdate"` with every test reported PASSED. birpc's
  // 60s deadline is hard-coded and un-raisable, so there was nothing to tune.
  //
  // Two cuts, and the first is the one that removes work rather than spacing it:
  //
  // 1. THE 500 AND THE MIS-PATHED 404 ARE NOT RUN HERE. Their CLASSIFICATION is
  //    scored in `sweep-route-absence-matches-one-declared-path.test.ts`, which
  //    executes the real matcher and is mutation-scored — a 500, a sibling path,
  //    a prefix, a suffix and a resource 404 each proved `other` there. What this
  //    tier adds is the WIRING: that `other` reaches FAIL rather than PENDING.
  //    One case proves that wiring, and the 401 is the representative because an
  //    expired key is the most expensive false acceptance available.
  //
  //    ⚠️ WHAT THAT COSTS, STATED: this tier no longer shows a 500 or a
  //    mis-pathed 404 travelling the sweep end to end. A defect that classified
  //    correctly and mis-wired ONLY for inputs other than the 401 would survive
  //    here — and no single-path wiring case can distinguish that, whichever
  //    input it picks.
  //
  // 2. THEY RUN SEQUENTIALLY. `Promise.all` made four concurrent children; the
  //    loop below makes one at a time, so this file contributes 1 rather than 4
  //    to the suite's peak. Wall time becomes the SUM — which the budget below
  //    covers and which the victim's margin requires.
  const configured: readonly (readonly [string, Conditions])[] = [
    ["as-declared", { routeMissing: asDeclared }],
    // No `routeMissing` at all: the stub serves the leaf a healthy document, so
    // the route is LIVE and the declaration is stale.
    ["route-is-live", {}],
    ["other-failure-401", { unauth: [pendingLeaf] }],
    // The declared leaf answers as declared, AND an undeclared leaf produces the
    // identical sentence. One sweep proves the acceptance is bound to the
    // declaration rather than to the shape of the refusal.
    [
      "undeclared-same-sentence",
      { routeMissing: `${asDeclared}\n${undeclaredLeaf}\t/api/public/v1/not-a-deployed-route` }
    ]
  ];

  for (const [key, conditions] of configured) {
    // `await` IN THE LOOP is the bound, and it is deliberate rather than an
    // oversight a reader should "fix" back to `Promise.all`. The loop still
    // yields between children, so this worker's event loop keeps turning and its
    // own RPC replies are read — the property the async spawn exists for.
    outcomes.set(key, await runSweep(conditions));
  }
}, 900_000);

function outcome(key: string): Outcome {
  const stored = outcomes.get(key);
  if (stored === undefined) {
    throw new Error(`no sweep was run for "${key}" — the hook did not reach it.`);
  }
  return stored;
}

/**
 * 🚨 ASYNC ON PURPOSE. `spawnSync` would block the event loop for the whole
 * child, and vitest's birpc `onTaskUpdate` call is in flight while a hook runs —
 * hold the loop past its 60s ceiling and the run dies `Timeout calling
 * "onTaskUpdate"` with every test above it reported PASSED, a red no assertion
 * explains. `sweep-promotes-warn-only-under-strict.test.ts` carries the
 * measurement; this file spawns six children in one hook and depends on the same
 * property.
 */
function runSweep(conditions: Conditions): Promise<Outcome> {
  const child = spawn("bash", [SWEEP, "--profile", "stub", "--strict"], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      NEXUS_BIN: `bash ${STUB}`,
      // The declared skips always answer as the environment does. This file is
      // about the pending-deploy arms, and an undeclared skip would add a FAIL
      // that belongs to a different mechanism to every count below.
      STUB_SKIP_LEAVES: declaredSkips.join("\n"),
      STUB_ROUTE_MISSING: conditions.routeMissing ?? "",
      STUB_FAIL_LEAVES: (conditions.fail ?? []).join("\n"),
      STUB_UNAUTH_LEAVES: (conditions.unauth ?? []).join("\n")
    }
  });

  return new Promise<Outcome>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    // `close`, not `exit`: `exit` can fire before the pipes have flushed, which
    // would drop the `Summary:` line and turn a real count into a spurious
    // REFUSAL.
    child.on("close", (code) => resolve({ status: code ?? -1, stdout, stderr }));
  });
}

function summaryOf(result: Outcome): string {
  const match = result.stdout.match(/^Summary: .*$/m);
  if (match === null) {
    throw new Error(
      `sweep.sh printed no Summary line, so it REFUSED rather than counting (exit ${result.status}). ` +
        `Its exit code is therefore not a FAIL+WARN total. stderr:\n${result.stderr.slice(0, 800)}`
    );
  }
  return match[0];
}

/** The result row for one leaf, so an assertion names the leaf rather than the run. */
function rowFor(result: Outcome, leaf: string): string {
  const row = result.stdout
    .split("\n")
    .find((line) => /^(PASS|FAIL|WARN|SKIP|PENDING)\s/.test(line) && line.includes(leaf));
  if (row === undefined) {
    throw new Error(
      `no result row for "${leaf}" — the sweep did not execute it (exit ${result.status}). ` +
        `A sweep that skipped the leaf under test would satisfy every assertion about it vacuously.`
    );
  }
  return row;
}

/**
 * The NOTE of one leaf's result row — everything after the leaf's own name.
 *
 * 🚨 SEPARATE FROM {@link rowFor} BECAUSE AN ASSERTION ABOUT *WHICH ARM* PRODUCED
 * A ROW HAS TO ANCHOR ON HOW THE NOTE BEGINS. Two of the sweep's FAIL notes both
 * CONTAIN `exit=` — the generic one opens with it, and the
 * declared-but-different one reaches it at the end, after
 * `DECLARED pending-deploy (…) BUT THIS IS A DIFFERENT FAILURE` — so a substring
 * assertion cannot tell them apart. Their OPENING is the one place they are
 * disjoint, which is the same move `route-not-deployed.sh` makes on the path: bind
 * the boundary, not the presence.
 *
 * Slicing after the leaf name is exact rather than column-arithmetic over
 * `printf`'s padding: the padding width is the script's to change, and a swept
 * leaf's path appears once in its own row.
 */
function noteFor(result: Outcome, leaf: string): string {
  const row = rowFor(result, leaf);
  return row.slice(row.indexOf(leaf) + leaf.length).trimStart();
}

describe("a declared pending-deploy route is accepted once, and retires itself", () => {
  it.skipIf(!HAS_DECLARATION)(
    "derives a declaration, its route, and an undeclared leaf beside it",
    () => {
      // Vacuity controls, ahead of every case that depends on them. With no
      // declaration there is nothing to accept, and every assertion below would be
      // true of nothing.
      expect(pendingLeaf).not.toBe("");
      expect(pendingRoute).not.toBe("");
      expect(pendingCause).not.toBe("");
      expect(undeclaredLeaf).not.toBe("");
      expect(undeclaredLeaf).not.toBe(pendingLeaf);
      // The route is spliced into an ERE. A declaration carrying a metacharacter
      // would accept far more than the one absence it names.
      expect(pendingRoute).toMatch(/^\/[A-Za-z0-9/_.~-]+$/);
    }
  );

  // ── The one that must be ACCEPTED ─────────────────────────────────────────

  it.skipIf(!HAS_DECLARATION)(
    "reports PENDING and exits 0 under --strict when the declared route is absent",
    () => {
      const run = outcome("as-declared");

      // The ROW first: a run that exits 0 having never executed the leaf would
      // satisfy the status assertion while proving nothing.
      expect(rowFor(run, pendingLeaf)).toContain("PENDING");
      // The cause reaches the report, so a reader can judge whether the acceptance
      // is still right without opening the declaration.
      expect(rowFor(run, pendingLeaf)).toContain(pendingCause);
      expect(rowFor(run, pendingLeaf)).toContain(pendingRoute);

      // 🚨 THE DENOMINATOR. A bare `1 pending deploy` cannot separate "the one
      // absence this branch declared" from "one of three fired and two silently
      // stopped applying" — and the two that stopped are leaves whose routes have
      // gone live, which is the event the whole mechanism exists to catch.
      const ratio = /· (\d+)\/(\d+) pending deploy ·/.exec(summaryOf(run));
      if (ratio === null) {
        throw new Error(`the summary carries no pending-deploy ratio: ${summaryOf(run)}`);
      }
      // Every declaration fired, so the acceptance still describes this
      // environment. A numerator below the denominator is a declaration whose
      // route has gone live, which the `route-is-live` case below scores.
      expect(ratio[1]).toBe(ratio[2]);

      expect(summaryOf(run)).toMatch(/· 0 warn · 0 fail ·/);
      // 🔴 THE ARM. PENDING must not reach the exit code, under `--strict`, which
      // is the mode CI runs.
      expect(run.status).toBe(0);
    }
  );

  // ── The ones that must stay RED ───────────────────────────────────────────

  it.skipIf(!HAS_DECLARATION)(
    "FAILS a declaration whose route is LIVE, and names the entry to delete",
    () => {
      // 🔴 THE SELF-RETIRING ARM. The leaf answers, so the acceptance has outlived
      // its reason and is standing ready to accept a 404 on behalf of whatever next
      // takes this leaf's name.
      const run = outcome("route-is-live");
      const row = rowFor(run, pendingLeaf);

      expect(row).toContain("FAIL");
      expect(row).toContain("STALE PENDING-DEPLOY DECLARATION");
      // It must name the remedy where the person reading the red is standing.
      expect(row).toContain("SWEEP_ROUTES_PENDING_DEPLOY");
      expect(row).toContain(pendingRoute);

      expect(summaryOf(run)).toMatch(/· 0\/\d+ pending deploy ·/);
      expect(run.status).toBeGreaterThan(0);
    }
  );

  // 🔎 THE 500 AND THE MIS-PATHED 404 CASES USED TO SIT HERE, each with its own
  // real sweep. They are in `sweep-route-absence-matches-one-declared-path.test.ts`
  // now, as matcher cases: that file executes the real shell matcher and is
  // mutation-scored, and it proves a 500 — including one whose message ECHOES the
  // declared path — a sibling path, a prefix, a suffix and a resource 404 all
  // answer `other`. What THIS tier owes is the wiring from `other` to FAIL, and
  // the 401 below is that case. Eleven concurrent real sweeps in one `vitest run`
  // is what starved `test/id-thread/id-thread-sweep.test.ts` past birpc's
  // un-raisable 60s deadline; these two runs were the cheapest to give up because
  // their discrimination was already armed elsewhere.

  it.skipIf(!HAS_DECLARATION)(
    "FAILS a declared leaf that returns a 401 — the most expensive false acceptance",
    () => {
      // An expired `NEXUS_STAGING_API_KEY` refuses every leaf at once. A mechanism
      // that absorbed a 401 under a pending-deploy entry would report a clean,
      // entirely vacuous sweep.
      const run = outcome("other-failure-401");
      const row = rowFor(run, pendingLeaf);

      expect(row).toContain("FAIL");
      expect(row).not.toContain("PENDING");
      expect(row).toContain("Authentication failed");

      expect(summaryOf(run)).toMatch(/· 0\/\d+ pending deploy ·/);
      expect(run.status).toBeGreaterThan(0);
    }
  );

  it.skipIf(!HAS_DECLARATION)(
    "FAILS an UNDECLARED leaf producing the identical sentence, in the same run",
    () => {
      // Both leaves in ONE sweep, so the acceptance is proven bound to the
      // DECLARATION rather than to the shape of the refusal. A mechanism that
      // exempted by shape would report two PENDINGs and exit 0.
      const run = outcome("undeclared-same-sentence");

      expect(rowFor(run, pendingLeaf)).toContain("PENDING");

      expect(rowFor(run, undeclaredLeaf)).toContain("FAIL");

      // 🔴 THE ARM, AND `toContain("FAIL")` ABOVE IS NOT IT. Measured: a mutant that
      // stops keying the pending branch on the DECLARATION —
      // `if [[ -n "$pending_route" ]]` -> `… || true` — lets EVERY failing leaf into
      // that branch. An undeclared one is then asked about an empty route, the
      // matcher answers "no", and the row lands in the declared-but-different arm:
      //
      //   FAIL  agent list  DECLARED pending-deploy () BUT THIS IS A DIFFERENT
      //                     FAILURE — the declaration does not cover it: exit=1: …
      //
      // That row still READS `FAIL` and still does not read `PENDING`, so the two
      // assertions this replaces both held and the whole file passed 13/13 under it.
      // Exemption by shape is exactly what this case exists to refuse, and it could
      // not see it.
      //
      // So pin the note's OPENING. The generic FAIL opens `exit=`; the
      // declared-but-different one opens `DECLARED pending-deploy (`. Nothing else
      // separates them — both carry `exit=` somewhere.
      const undeclaredNote = noteFor(run, undeclaredLeaf);
      expect(undeclaredNote).toMatch(/^exit=\d+: /);
      expect(undeclaredNote).not.toContain("DECLARED pending-deploy");

      expect(summaryOf(run)).toMatch(/· 1 fail ·/);
      expect(summaryOf(run)).toMatch(/· 1\/\d+ pending deploy ·/);
      expect(run.status).toBe(1);
    }
  );

  // ── The policy-refusal path is untouched ──────────────────────────────────

  it.skipIf(!HAS_DECLARATION)(
    "leaves the policy-refusal branch alone — a declared opt-out still SKIPs",
    () => {
      // The new arm sits AFTER `is_policy_refusal` and must not have moved it. A
      // leaf that is both opted out and undeployed is still a declared SKIP.
      for (const key of ["as-declared", "undeclared-same-sentence"]) {
        const run = outcome(key);
        expect(summaryOf(run)).toMatch(
          new RegExp(`· ${declaredSkips.length}/${declaredSkips.length} declared skip ·`)
        );
        for (const skip of declaredSkips) {
          expect(rowFor(run, skip)).toContain("SKIP");
        }
      }
      // And the 401 configuration proves a non-policy refusal is still a FAIL in
      // the same breath, which is the other half of that spec's contract.
      expect(rowFor(outcome("other-failure-401"), pendingLeaf)).toContain("FAIL");
    }
  );

  // ── Wiring ────────────────────────────────────────────────────────────────

  it("is WIRED to a PENDING, and the matcher lives in ONE file", () => {
    // 🚨 AN UNWIRED MATCHER AND AN ABSENT ONE READ THE SAME, and the cases above
    // all run the real script so they would catch that — this arm catches the
    // SECOND COPY regrowing, which they would not. A pasted pattern keeps
    // agreeing with itself after this one is narrowed or widened.
    const pattern = MATCHER_SOURCE.match(
      /^ROUTE_NOT_DEPLOYED_PATTERN_FORMAT='("message":[^']+)'$/m
    );
    if (pattern === null) {
      throw new Error(
        "Could not find ROUTE_NOT_DEPLOYED_PATTERN_FORMAT in scripts/route-not-deployed.sh. " +
          "If the assignment moved, update this extraction — do NOT inline a copy of the pattern here."
      );
    }
    expect(SWEEP_SOURCE).not.toContain(pattern[1]);
    expect(SWEEP_SOURCE).toContain('. "$SCRIPT_DIR/route-not-deployed.sh"');
    expect(SWEEP_SOURCE).toMatch(/\bis_route_not_deployed\b/);

    // Sourced under a GUARD. `set -e` is off, so an unguarded source would leave
    // the function undefined, every call would fail, and a declared absence would
    // read as a CLI regression while the self-retiring arm never ran at all.
    const start = SWEEP_SOURCE.indexOf("# shellcheck source=./route-not-deployed.sh");
    expect(start).toBeGreaterThan(-1);
    const guard = SWEEP_SOURCE.slice(start);
    const refusal = guard.slice(0, guard.indexOf("\nfi") + 3);
    expect(refusal).toMatch(/if\s+!\s+\.\s+"\$SCRIPT_DIR\/route-not-deployed\.sh";\s+then/);
    expect(refusal).toMatch(/exit 9/);
  });

  it("derives the declaration rather than restating it, and REFUSES on a failed derivation", () => {
    // Same discipline as the safe-leaf, fixture and expected-skip lists: a
    // derivation that failed must never degrade into an empty set. An empty one
    // here would turn a declared absence back into a red nobody can clear AND
    // make the stale arm unreachable, so the failure would be loud for a reason
    // that says nothing about the environment.
    expect(SWEEP_SOURCE).toMatch(
      /PENDING_DEPLOY_RAW=\$\(.*--print-pending-deploy\s+2>"\$PENDING_DEPLOY_STDERR"\)/
    );
    expect(SWEEP_SOURCE).toMatch(/^PENDING_DEPLOY_EXIT=\$\?$/m);

    const refusal = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf("PENDING_DEPLOY_EXIT=$?"),
      SWEEP_SOURCE.indexOf("is_fixture_backed()")
    );
    expect(refusal).toMatch(/if\s+\[\[\s+\$PENDING_DEPLOY_EXIT\s+-ne\s+0\s+\]\]/);
    expect(refusal).toContain("could not derive the pending-deploy list");
    // BOTH streams — `pnpm exec` names an unresolvable tool on STDOUT, which
    // `$(...)` traps in the variable rather than letting it reach the log.
    expect(refusal).toMatch(/printf '%s\\n' "\$PENDING_DEPLOY_RAW"/);
    expect(refusal).toContain('cat "$PENDING_DEPLOY_STDERR"');
    expect(refusal).toMatch(/exit 10/);

    // And the derived pairing has to reach the arguments `run_leaf` reads — the
    // link that makes all of the above load-bearing.
    const membership = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf("pending_deploy_declaration()"),
      SWEEP_SOURCE.indexOf("ELAPSED=")
    );
    expect(membership).toMatch(/done\s*<<<\s*"\$PENDING_DEPLOY_RAW"/);
    expect(membership).toMatch(
      /run_leaf "\$leaf" true "\$expected" "\$pending_route" "\$pending_cause"/
    );
    expect(membership).toMatch(
      /run_leaf "\$leaf" false "\$expected" "\$pending_route" "\$pending_cause"/
    );
  });

  it("keeps PENDING out of the exit code in BOTH modes", () => {
    const exits = [...SWEEP_SOURCE.matchAll(/^\s*exit .*$/gm)].map((m) => m[0].trim());

    // A control on the extraction. Zero matches would vacuously satisfy the loop.
    expect(exits).toContain("exit $(( FAIL + WARN ))");
    expect(exits).toContain('exit "$FAIL"');

    for (const line of exits) {
      expect(line).not.toContain("PENDING");
    }
  });

  it("declares no FIXTURE-BACKED leaf — the seeder would POST at a route that is absent", () => {
    // `seed-sweep-fixtures.sh` writes a row for every `safe-with-fixture` leaf and
    // reads the SAME `--print-expected-skips` producer to subtract the ones policy
    // refuses. It knows nothing about a route that is not deployed, so a
    // fixture-backed leaf declared here would be POSTed at a path that does not
    // exist and reported as a fixture somebody has to create — permanently, and
    // with a remedy nobody can perform.
    //
    // Nothing else enforces this, so it is enforced here rather than written in a
    // comment nobody reads at the moment it would matter.
    return classifyCommandUniverse().then((universe) => {
      const overlap = (declared: readonly string[]): string[] =>
        declared.filter((path) => universe.fixtureBacked.includes(path));

      expect(overlap(universe.pendingDeploy.map(({ path }) => path))).toEqual([]);

      // 🔴 THE CONTROL, AND IT IS NOT A FLOOR ON THE DECLARATION. An empty
      // `pendingDeploy` satisfies the arm above while asserting nothing — but
      // empty is this mechanism's RESTING state, so a `toBeGreaterThan(0)` here
      // reds the file on the day the last entry correctly retires. What the
      // negative arm actually needs is proof that this filter CAN report an
      // overlap, which is a question about the filter and not about the map: feed
      // it a fixture-backed leaf and it must come back naming it.
      const witness = universe.fixtureBacked[0];
      if (witness === undefined) {
        throw new Error(
          "no `safe-with-fixture` leaf exists, so the overlap arm above has nothing to be " +
            "wrong about — this control is itself unmeasured."
        );
      }
      expect(overlap([witness])).toEqual([witness]);
    });
  });

  it("declares exactly the leaves the sweep executes — a declaration for anything else is drift", async () => {
    const report = await classifyCommandUniverse();

    // A declaration naming a leaf that is `registration-only`, renamed or deleted
    // would sit there accepting a 404 for whatever later takes that name.
    expect(report.stalePendingDeploy).toEqual([]);
    for (const { path } of report.pendingDeploy) {
      expect(report.safe).toContain(path);
    }
  });

  it("DETECTS drift — the `toEqual([])` above is not satisfied by an empty map", () => {
    // 🔴 THE CONTROL FOR THE ARM ABOVE, and it scores the DETECTOR rather than
    // flooring the declaration. `stalePendingDeploy` is empty both when nothing
    // has drifted and when nothing is declared, and empty is this mechanism's
    // resting state — so `toBeGreaterThan(0)` on the map would red the file on
    // the day the last entry correctly retires, which is the one day it is
    // supposed to be silent.
    //
    // `staleDeclarations` is the exported function `classifyCommandUniverse`
    // computes that field with, so this asks the real detector two questions it
    // must answer differently.
    return classifyCommandUniverse().then((report) => {
      const swept = report.safe[0];
      if (swept === undefined) {
        throw new Error(
          "the sweep executes no leaves at all, so the drift arm above is unmeasured."
        );
      }
      // A declared leaf the sweep DOES execute is not drift…
      expect(staleDeclarations([swept], report.safe)).toEqual([]);
      // …and one it does not is, by name. A detector that answered `[]` to both
      // is what the arm above would be reading as a clean tree.
      expect(staleDeclarations(["noun-no-command-registers list"], report.safe)).toEqual([
        "noun-no-command-registers list"
      ]);
    });
  });
});
