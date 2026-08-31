/**
 * A `safe-with-fixture` LEAF THAT RETURNS NOTHING IS A FAILURE, NOT A PASS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE DISPOSITION EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sweep.sh` asserted exit 0 plus parseable JSON. Five leaves cleared that bar
 * while returning an EMPTY collection: the read exercises auth, routing, tenancy
 * scoping and the response envelope, and asserts NOTHING about item shape.
 *
 * The obvious fix — seed a row and leave them `safe` — is worse than the gap it
 * closes. A seeded row someone later deletes turns real coverage back into a
 * green row nobody re-examines, with no event anywhere to notice it. The gap was
 * at least VISIBLE. So the seed is not the feature; the ASSERTION is, and the
 * seed is its setup.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * VERIFIED BY MUTATION AGAINST THE LIVE ENVIRONMENT, NOT BY THIS FILE ALONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Delete the seeded `user-group` row, sweep staging, and it FAILS with
 * `FIXTURE MISSING` naming `user-group list`. Re-run the seed and it is green
 * again. This spec cannot reach a live API; it holds the wiring in place so that
 * loop keeps working, and an unwired gate reads exactly like a passing one.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classifyCommandUniverse, COMMAND_CLASSIFICATION } from "./command-universe";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNER = join(PACKAGE_ROOT, "scripts", "scan-response.py");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const SEED = join(PACKAGE_ROOT, "scripts", "seed-sweep-fixtures.sh");

/** scan-response.py exit 4: valid JSON, and it holds no rows. */
const EXIT_EMPTY = 4;

function scan(payload: string, args: string[] = []): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("python3", [SCANNER, ...args], {
      input: payload,
      encoding: "utf8"
    });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? -1, stdout: failure.stdout ?? "" };
  }
}

describe("safe-with-fixture", () => {
  it("has leaves — an empty population makes every assertion below vacuous", async () => {
    const report = await classifyCommandUniverse();
    expect(report.fixtureBacked.length).toBeGreaterThan(0);
  });

  it("puts every fixture-backed leaf in the set the sweep EXECUTES", async () => {
    // `safe` is what sweep.sh runs. A fixture-backed leaf that is not in it is
    // declared, asserted about, and never actually invoked — which reports a
    // clean sweep over a leaf nothing touched.
    const report = await classifyCommandUniverse();
    for (const leaf of report.fixtureBacked) {
      expect(report.safe).toContain(leaf);
    }
  });

  it("counts exactly the leaves the table declares", async () => {
    const declared = Object.entries(COMMAND_CLASSIFICATION)
      .filter(([, disposition]) => disposition === "safe-with-fixture")
      .map(([path]) => path)
      .sort();
    const report = await classifyCommandUniverse();
    expect([...report.fixtureBacked].sort()).toEqual(declared);
  });

  it("reads the three empty shapes the CLI actually returns", () => {
    // Not one canonical envelope. A rule written against `{data: []}` alone
    // passes `[]` and `{folders: [], assignments: []}` straight through.
    for (const empty of ['{"data":[]}', "[]", '{"folders":[],"assignments":[]}']) {
      expect(scan(empty, ["--require-non-empty"]).code).toBe(EXIT_EMPTY);
    }
    for (const full of [
      '{"data":[{"id":1}]}',
      '[{"id":1}]',
      '{"folders":[{"id":1}],"assignments":[]}'
    ]) {
      expect(scan(full, ["--require-non-empty"]).code).toBe(0);
    }
  });

  it("does not call a scalars-only response empty", () => {
    // `role automation-settings` is scalars all the way down. Calling that
    // empty would red a leaf with nothing wrong with it.
    expect(scan('{"organizationId":"o","hoursPerDay":7.6}', ["--require-non-empty"]).code).toBe(0);
  });

  it("asserts emptiness ONLY when asked", () => {
    // Six leaves already classified `safe` read empty against staging today.
    // Applying this rule to them would red the sweep on a change nobody made.
    expect(scan('{"data":[]}').code).toBe(0);
  });

  it("prints the EMPTY marker, so the caller keys off a positive answer", () => {
    // Same reason the NOT-JSON marker exists: a bare exit status cannot tell
    // the caller which of two branches it is in.
    const result = scan('{"data":[]}', ["--require-non-empty"]);
    expect(result.stdout.trim()).toBe("EMPTY");
  });

  it("lets a secret outrank an empty read", () => {
    // Both are failures; only one must never have its payload quoted, so it has
    // to win the branch or the leak path reopens through the empty arm.
    const result = scan(JSON.stringify({ data: [], pushToken: "a".repeat(40) }), [
      "--require-non-empty"
    ]);
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("pushToken");
  });

  it("is WIRED into sweep.sh as a CHAIN, not as three strings in one file", () => {
    // 🚨 THIS ASSERTED THREE SUBSTRINGS AND BUGBOT CAUGHT THAT IT WAS THE SAME
    // VACUITY THIS BRANCH CLOSED FOR THE SEED. Derive the list, then ignore it,
    // and all three stayed true while every non-emptiness assertion was
    // silently skipped — the sweep reporting PASS over exactly the leaves the
    // disposition exists to check.
    const sweep = readFileSync(SWEEP, "utf8");

    // 1. Derive, with the redirect on the same assertion as the command.
    expect(sweep).toMatch(/FIXTURE_RAW=\$\(.*--print-fixture-leaves\s+2>"\$FIXTURE_STDERR"\)/);
    expect(sweep).toMatch(/^FIXTURE_EXIT=\$\?$/m);

    // 2. Refuse on a failed derivation, printing BOTH streams — stdout is where
    //    `pnpm exec` names an unresolvable tool, and `$(...)` traps it.
    const refusal = sweep.slice(
      sweep.indexOf("FIXTURE_EXIT=$?"),
      sweep.indexOf("is_fixture_backed()")
    );
    expect(refusal).toMatch(/if\s+\[\[\s+\$FIXTURE_EXIT\s+-ne\s+0\s+\]\]/);
    expect(refusal).toContain("could not derive the fixture-backed leaf list");
    expect(refusal).toMatch(/printf '%s\\n' "\$FIXTURE_RAW"/);
    expect(refusal).toContain('cat "$FIXTURE_STDERR"');
    expect(refusal).toMatch(/exit 6/);

    // 3. THE LINK THAT WAS MISSING: the derived list feeds the membership test.
    const membership = sweep.slice(sweep.indexOf("is_fixture_backed()"), sweep.indexOf("ELAPSED="));
    expect(membership).toMatch(/done\s*<<<\s*"\$FIXTURE_RAW"/);

    // 4. And membership decides whether run_leaf is told to assert non-emptiness.
    expect(membership).toMatch(/if\s+is_fixture_backed\s+"\$leaf"/);
    expect(membership).toMatch(/run_leaf "\$leaf" true/);

    // 5. Which is the flag the scanner reads.
    expect(sweep).toContain("--require-non-empty");
  });

  it("READS that flag on the SKIP path too, which is where the chain used to end", () => {
    // 🚨 THE LINK ABOVE STOPS ONE SHORT, AND THAT IS THE DEFECT THIS FILE IS
    // ABOUT, COMMITTED BY THIS FILE.
    //
    // Steps 1-5 prove `run_leaf` is TOLD to assert non-emptiness. They never
    // prove it ACTS on being told in every path it can take. It could not:
    // `require_non_empty` was bound at the top of `run_leaf`, the command ran
    // one line later, and the `exit_code -ne 0` SKIP branch returned BEFORE the
    // variable was read. So a `safe-with-fixture` leaf that answered 403
    // bypassed every assertion above and reported SKIP — the same row a leaf
    // with no fixture assertion at all produces.
    //
    // That happened. `role job-types` is `safe-with-fixture`, the swept
    // organisation was opted out of the Role primitive, and the strongest
    // assertion in the sweep went dark while the disposition table still called
    // it fixture-backed and COMPATIBILITY.md still counted it as swept.
    //
    // Tracing a chain link by link and stopping one link before the one that
    // matters is the same vacuity as asserting on your own mock.
    const sweep = readFileSync(SWEEP, "utf8");

    const skipBranch = sweep.slice(
      sweep.indexOf("if [[ $exit_code -ne 0 ]]; then"),
      sweep.indexOf("# One pass answers both questions")
    );

    // The slice is the region under test, not the whole file — a substring
    // assertion over 460 lines of shell matches a comment by default.
    expect(skipBranch.length).toBeGreaterThan(0);
    expect(skipBranch).toMatch(/if\s+\[\[\s+"\$require_non_empty"\s+==\s+"true"\s+\]\]/);
    // And it must SAY what was lost. A skip row that reads like every other skip
    // row is how this went unnoticed for the leaf it was written for.
    expect(skipBranch).toContain("non-emptiness assertion did NOT run");
  });

  it("names the remedy and forbids the shortcut, in the failure line itself", () => {
    // The cheapest way to clear a FIXTURE MISSING is to reclassify the leaf as
    // `safe`, which restores the exact vacuous green this disposition exists to
    // delete. The message has to say so where somebody will read it.
    const sweep = readFileSync(SWEEP, "utf8");
    const line = sweep.slice(sweep.indexOf("FIXTURE MISSING"));
    expect(line.slice(0, line.indexOf("\n"))).toContain("seed-sweep-fixtures.sh");
    expect(line.slice(0, line.indexOf("\n"))).toContain("do NOT reclassify");
  });

  it("decides its exit code from the DERIVED set, not from its own list of ensures", () => {
    // 🚨 THE TEST ABOVE PINNED ONE BRANCH AND BUGBOT CAUGHT THAT IT WAS NOT
    // ENOUGH. The seed's `ensure` calls are a hardcoded list, and a hardcoded
    // list is the defect this whole disposition deletes. Two ways it goes wrong,
    // both leaving the seed green while the sweep keeps failing:
    //
    //   1. A leaf is declared `safe-with-fixture` and nobody adds an `ensure`.
    //   2. An `ensure` is dropped or renamed in a refactor.
    //
    // The remedy then reports success at a reader whose sweep is still red, with
    // nothing left to try. So the exit code is decided against the SAME
    // derivation sweep.sh uses, over every leaf it names.
    //
    // Verified by mutation: declare a sixth leaf with no `ensure` call, and the
    // seed goes exit 0 -> exit 1 with `UNSATISFIED emulator scenario list`.
    const seed = readFileSync(SEED, "utf8");

    // 🚨 SCATTERED SUBSTRINGS WERE NOT ENOUGH, AND BUGBOT CAUGHT THAT TOO. This
    // asserted that `--print-fixture-leaves`, `DERIVE_EXIT` and the exit
    // arithmetic all APPEARED somewhere, which a regression that derives the
    // list and then ignores it satisfies completely. The assertion has to
    // follow the CHAIN: derive -> feed the loop -> check each leaf -> count ->
    // exit. Any link asserted alone is a link the next regression walks around.

    // 1. It asks the derivation rather than trusting its own `ensure` calls —
    //    and the stderr redirect is part of the SAME assertion, so restoring
    //    `2>/dev/null` breaks the line rather than some other line.
    expect(seed).toMatch(/FIXTURE_LEAVES=\$\(.*--print-fixture-leaves\s+2>"\$FIXTURE_STDERR"\)/);
    expect(seed).toMatch(/^DERIVE_EXIT=\$\?$/m);

    // 2. THE REFUSAL GATE ITSELF, pinned as a unit rather than as substrings
    //    scattered near each other. The hole this closes: leave every message
    //    and every stream in place and only weaken the CONDITION — say
    //    `-eq 999` — and a failed derivation walks straight past the refusal
    //    with an empty capture, the loop iterates over nothing, UNSATISFIED
    //    stays 0 and the script exits 0 having verified nothing. Every
    //    substring assertion below stays true through that.
    const refusal = seed.slice(seed.indexOf("DERIVE_EXIT=$?"), seed.indexOf("UNSATISFIED=0"));
    expect(refusal).toMatch(/if\s+\[\[\s+\$DERIVE_EXIT\s+-ne\s+0\s+\]\]/);
    expect(refusal).toContain("refusing to report success");
    expect(refusal).toMatch(/printf '%s\\n' "\$FIXTURE_LEAVES"/);
    expect(refusal).toContain('cat "$FIXTURE_STDERR"');
    expect(refusal).toMatch(/exit 7/);

    // 3. THE LINK THAT WAS MISSING: the derived list actually FEEDS the loop.
    //    Deriving and ignoring is the regression this guard exists to catch.
    const verification = seed.slice(
      seed.indexOf("UNSATISFIED=0"),
      seed.indexOf("Summary: $SEEDED")
    );
    expect(verification).toMatch(/while\s+IFS=\s+read\s+-r\s+leaf/);
    expect(verification).toMatch(/done\s*<<<\s*"\$FIXTURE_LEAVES"/);

    // 4. And each leaf from that list is the thing actually checked and counted.
    expect(verification).toContain('already_has_rows "$leaf"');
    expect(verification).toContain("UNSATISFIED=$((UNSATISFIED + 1))");

    // 5. The count reaches the exit code. `exit "$FAILED"` alone would drop it.
    expect(seed).toMatch(/exit \$\(\( *FAILED \+ UNSATISFIED *\)\)/);
  });

  it("records what it refuses to seed, and why, beside the seed itself", () => {
    // Four leaves are NOT fixture-backed on purpose. Without the reasons next
    // to the script, the next reader sees an incomplete seed and finishes it —
    // creating pending approvals in a shared org, or spending on inference.
    const seed = readFileSync(SEED, "utf8");
    for (const refusal of [
      "role creation-requests",
      "channel whatsapp-template approvals",
      "vibe approvals pending",
      "emulator scenario list",
      "workspace status"
    ]) {
      expect(seed).toContain(refusal);
    }
  });

  it("never exits 0 over a fixture-backed leaf it left unsatisfied", () => {
    // The seed is the remedy the sweep's failure message points at. A remedy
    // that reports success while the leaf is still empty sends the reader back
    // to a sweep that keeps failing, with nothing left to try — the same false
    // green this disposition exists to delete, reintroduced inside its own fix.
    //
    // `html-template` is the only leaf with a precondition it cannot create
    // (an EMBED deployment must already exist). It used to SKIP on that and
    // still exit 0. Verified by mutation: force the precondition missing and
    // the leaf empty, and the seed exits 1 with `BLOCKED html-template`.
    const seed = readFileSync(SEED, "utf8");

    // Presence is asked BEFORE reachability. The other order reports a skip on
    // an org that already has rows, and never counts the leaf as present.
    const presenceCheck = seed.indexOf('already_has_rows "html-template list"');
    const reachabilityCheck = seed.indexOf('-z "$DEPLOYMENT_ID"');
    expect(presenceCheck).toBeGreaterThan(-1);
    expect(reachabilityCheck).toBeGreaterThan(-1);
    expect(presenceCheck).toBeLessThan(reachabilityCheck);

    // And an unsatisfied-plus-unseedable leaf counts, so the exit code carries
    // it. `exit "$FAILED"` is what turns the count into a refusal.
    const blocked = seed.slice(reachabilityCheck, seed.indexOf("else", reachabilityCheck));
    expect(blocked).toContain("BLOCKED");
    expect(blocked).toContain("FAILED=$((FAILED + 1))");

    // The count has to REACH the exit code. This asserted `exit "$FAILED"` and
    // went red when that became `exit $((FAILED + UNSATISFIED))` — the
    // assertion working, not breaking: the exit is what it is pinning, and the
    // exit genuinely changed. It now names the term this test owns and lets the
    // derived-set test own the other.
    expect(seed).toMatch(/exit \$\(\([^)]*FAILED[^)]*\)\)/);
  });

  it("is not run by CI, and says why where somebody would wire it up", () => {
    // `cli-sweep` holds a READ-ONLY key precisely so the gate cannot mutate the
    // environment it measures. Someone will try to automate this seed; the
    // reason it stays manual has to be at the top of the file they open.
    const seed = readFileSync(SEED, "utf8");
    expect(seed).toContain("NOT RUN BY CI");
    expect(seed).toContain("READ-ONLY");
  });
});
