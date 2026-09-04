/**
 * THE SWEEP SKIPS A DECLARED FEATURE OPT-OUT — AND NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROTECTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sweep.sh` runs every read-only leaf against a live staging org. When that org
 * has opted OUT of a feature, the API answers 403 "This organization has opted
 * out of this feature" — the environment answering correctly, with no CLI defect
 * anywhere. Four `role *` leaves did exactly that, so `CLI: Sweep` was red on
 * every PR touching the CLI's package graph for a reason no code change could
 * clear. A check that is permanently red for a correct reason is worse than no
 * check: it trains every reader to score red as noise, and it hides the first
 * real failure behind four expected ones.
 *
 * The cure is the mechanism `ticket list` has always used — a phrase allowlist
 * over the backend's own message — extended by one sentence. This spec is what
 * stops that cure turning into a blanket amnesty.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FAILURE THIS EXISTS FOR IS THE *BROADENED* MATCHER, NOT THE MISSING ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A missing phrase is loud: the leaf goes red and somebody looks at it. A matcher
 * that is too WIDE is silent and permanent, and every tempting shape is too wide:
 *
 *   - `403 means skip` — swallows every authorization regression there is.
 *   - the `FEATURE_NOT_ENABLED` wire code — shared with refusals that ARE bugs.
 *   - `exit code != 0 means skip` — a sweep that can no longer fail.
 *
 * Each of those turns the whole gate into a 69-leaf green light while reporting
 * a healthy-looking `n pass · n skip`, and a shrunken suite reads exactly like a
 * passing one. So the assertions below are deliberately lopsided: ONE case proves
 * the opt-out skips, and FIVE prove that things which merely resemble it do not.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY IT READS THE PATTERN OUT OF THE SCRIPT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The regex is extracted from `scripts/policy-refusal.sh` and executed with the
 * same `grep -E` the script uses, rather than restated here. A copy in this file
 * would be a second place for the rule to live, and the copy would keep passing
 * after the original was broadened — the spec would go green about a matcher
 * nothing runs.
 *
 * It moved out of `sweep.sh` when `seed-sweep-fixtures.sh` came to need the same
 * answer. That is the same argument one level up: two scripts asking "is this
 * refusal policy" from two copies of the phrase list would drift, and the drift
 * would be silent in the direction that matters — the seeder would keep treating
 * a permanently-refused leaf as a fixture somebody has to create. So the spec
 * now asserts three things rather than two: the pattern is narrow, ONE file
 * holds it, and BOTH callers reach for that file instead of restating it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SPEC CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It never calls the live API, so it cannot prove today's staging responses take
 * these shapes. The end-to-end proof is a stubbed `NEXUS_BIN` that answers the
 * `role *` leaves with the opt-out body and four other leaves with a 401, a 500,
 * an unknown subcommand and a NON-opt-out 403; the sweep then reports
 * `60 pass · 5 skip · 0 warn · 4 fail`, and deleting the phrase from `sweep.sh`
 * moves it to `60 pass · 1 skip · 0 warn · 8 fail`.
 *
 * It also cannot see the backend. These phrases are English sentences owned by
 * `apps/backend`, and `packages/cli` is mirrored to a public repository on its
 * own, so no assertion here may reach across that boundary. A backend reword
 * therefore re-reds this gate silently — the phrase list is a coupling that is
 * documented, not enforced.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classifyCommandUniverse } from "./command-universe";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const SWEEP_SOURCE = readFileSync(SWEEP, "utf8");
const SEED = join(PACKAGE_ROOT, "scripts", "seed-sweep-fixtures.sh");
const SEED_SOURCE = readFileSync(SEED, "utf8");
const MATCHER = join(PACKAGE_ROOT, "scripts", "policy-refusal.sh");
const MATCHER_SOURCE = readFileSync(MATCHER, "utf8");

/** The call both scripts make, and the only spelling either one may write. */
const CALL = 'is_policy_refusal "$out"';

/**
 * The live skip pattern, lifted from `policy-refusal.sh` rather than restated.
 *
 * Anchored on the assignment the file actually holds. A failure to find it is
 * thrown rather than defaulted: a spec that silently fell back to a hardcoded
 * pattern would keep asserting after the script stopped containing one, which is
 * the exact false green this file is about.
 */
function skipPattern(): string {
  const match = MATCHER_SOURCE.match(/^POLICY_REFUSAL_PATTERN='("message":[^']+)'$/m);
  if (!match) {
    throw new Error(
      "Could not find POLICY_REFUSAL_PATTERN in scripts/policy-refusal.sh. If the " +
        "assignment moved, update this extraction — do NOT inline a copy of the pattern here."
    );
  }
  return match[1];
}

/** True when `sweep.sh` would classify this CLI error document as a SKIP. */
function wouldSkip(errorDocument: unknown): boolean {
  const payload = JSON.stringify(errorDocument, null, 2);
  try {
    execFileSync("grep", ["-qE", skipPattern()], { input: payload });
    return true;
  } catch {
    return false;
  }
}

/**
 * The shape `printCliError` emits under `--json` — see `src/errors.ts`. The
 * message carries the `API error (<status>): ` prefix the CLI prepends, because
 * that prefix sits between `"message": "` and the phrase and any matcher has to
 * survive it.
 */
function cliError(message: string, code: string): unknown {
  return { error: { message, hint: null, code } };
}

describe("the sweep skips a declared feature opt-out, and nothing else", () => {
  it("SKIPs the opt-out 403 that made four `role *` leaves permanently red", () => {
    expect(
      wouldSkip(
        cliError(
          "API error (403): This organization has opted out of this feature",
          "FEATURE_NOT_ENABLED"
        )
      )
    ).toBe(true);
  });

  it("still SKIPs the `ticket list` precedent this mechanism was copied from", () => {
    // `not configured` is the phrase that has carried `ticket list` since this
    // allowlist existed. Adding a sentence must not disturb it.
    expect(
      wouldSkip(
        cliError(
          "API error (403): Ticketing is not configured for this environment",
          "FEATURE_NOT_ENABLED"
        )
      )
    ).toBe(true);
  });

  // ── The five that must stay RED ───────────────────────────────────────────
  //
  // Each is a real failure the sweep exists to catch, and each resembles the
  // skipped case along exactly one axis — status, wire code, or exit code.

  it("does NOT skip a 403 that is an authorization refusal rather than an opt-out", () => {
    // THE LOAD-BEARING ONE. Same status as the skipped case. A matcher keyed on
    // 403 rather than on the sentence turns every permissions regression green.
    expect(
      wouldSkip(
        cliError("API error (403): You do not have permission to perform this action", "FORBIDDEN")
      )
    ).toBe(false);
  });

  it("does NOT skip a 403 that merely carries the FEATURE_NOT_ENABLED code", () => {
    // Same wire code as the skipped case; different sentence. The guard reuses
    // that code deliberately, so the code cannot be the discriminator.
    expect(
      wouldSkip(cliError("API error (403): Access denied for this route", "FEATURE_NOT_ENABLED"))
    ).toBe(false);
  });

  it("does NOT skip a 401 — a broken CI key must never read as a feature gap", () => {
    // The most expensive false skip available: an expired NEXUS_STAGING_API_KEY
    // would skip all 69 leaves and report a clean, entirely vacuous sweep.
    expect(
      wouldSkip(cliError("Authentication failed — invalid or missing API key.", "UNAUTHENTICATED"))
    ).toBe(false);
  });

  it("does NOT skip a 500 — an outage is not environment policy", () => {
    expect(wouldSkip(cliError("API error (500): Internal server error", "INTERNAL"))).toBe(false);
  });

  it("does NOT skip a non-JSON failure such as an unknown subcommand", () => {
    // A commander error is plain text on stderr with no `"message":` field at
    // all, so it cannot reach the allowlist however wide the phrases get.
    const payload = "error: unknown command 'lsit'";
    let matched = true;
    try {
      execFileSync("grep", ["-qE", skipPattern()], { input: payload });
    } catch {
      matched = false;
    }
    expect(matched).toBe(false);
  });

  // ── Wiring ────────────────────────────────────────────────────────────────

  it("is WIRED to a SKIP — an unwired matcher and an absent one read the same", () => {
    // The matcher has to guard the SKIP emission itself. Asserting the pattern
    // exists somewhere in the file would survive a mutation that left it in a
    // comment while the branch matched everything.
    //
    // The region is bounded by the scanner comment rather than by the first
    // `return`: the branch now returns EARLY for an undeclared skip, so slicing
    // to the first `return` would cut the SKIP emission off entirely and this
    // assertion would fail for a reason that has nothing to do with wiring.
    const branch = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf(CALL),
      SWEEP_SOURCE.indexOf("# One pass answers both questions")
    );
    expect(SWEEP_SOURCE).toContain(CALL);
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).toContain("printf 'SKIP|%s|%s — DECLARED");
  });

  it("keeps ONE copy of the phrase list, and both callers reach for it", () => {
    // 🚨 THE FAILURE THIS CATCHES IS A SECOND COPY REGROWING, WHICH IS SILENT
    // AND WHICH PASSES EVERY OTHER ASSERTION IN THIS FILE. The six cases above
    // execute whatever `skipPattern()` returns; they say nothing about how many
    // places that pattern lives. `seed-sweep-fixtures.sh` needs the identical
    // answer — a leaf refused by policy cannot be seeded by anyone — and the
    // cheapest way to give it one is to paste the regex. The paste would keep
    // agreeing with itself after this file's copy was narrowed or widened, so
    // the two scripts would disagree about what "policy" means with nothing
    // anywhere to notice.
    //
    // So: the pattern appears in the matcher file and NOWHERE ELSE, and each
    // caller sources it. Asserting only that they source it would pass a script
    // that sources the file and then greps its own inline copy anyway.
    for (const [name, source] of [
      ["sweep.sh", SWEEP_SOURCE],
      ["seed-sweep-fixtures.sh", SEED_SOURCE]
    ] as const) {
      expect(source, `${name} inlines a second copy of the phrase list`).not.toContain(
        skipPattern()
      );
      expect(source, `${name} does not source the matcher`).toContain(
        '. "$SCRIPT_DIR/policy-refusal.sh"'
      );
      expect(source, `${name} does not call the shared matcher`).toMatch(/\bis_policy_refusal\b/);
    }
  });

  it("REFUSES when the matcher cannot be sourced, in both callers", () => {
    // Neither script runs under `set -e`, so a missing file leaves
    // `is_policy_refusal` undefined and every call fails — and the two scripts
    // fail in OPPOSITE, both-wrong directions: the sweep would score every
    // policy refusal as a CLI regression, and the seed would report a
    // permanently-unseedable leaf as a fixture somebody has to create. A
    // degraded run is worse than no run in both, so both refuse.
    for (const [name, source] of [
      ["sweep.sh", SWEEP_SOURCE],
      ["seed-sweep-fixtures.sh", SEED_SOURCE]
    ] as const) {
      // Anchored on the shellcheck directive that sits ABOVE the source line —
      // slicing from the source line itself starts one token past the `if !`
      // this then asserts on, and the assertion fails for a reason that has
      // nothing to do with the guard being present.
      const start = source.indexOf("# shellcheck source=./policy-refusal.sh");
      expect(start, `${name} has no shellcheck directive on the source`).toBeGreaterThan(-1);
      const guard = source.slice(start);
      const refusal = guard.slice(0, guard.indexOf("\nfi") + 3);
      expect(refusal, `${name} sources the matcher unguarded`).toMatch(
        /if\s+!\s+\.\s+"\$SCRIPT_DIR\/policy-refusal\.sh";\s+then/
      );
      expect(refusal, `${name} does not exit on a failed source`).toMatch(/exit 8/);
    }
  });

  it("reports the skip with its reason, so a shrunken suite cannot read as a green one", () => {
    // A silently-omitted case is indistinguishable from one that passed. The
    // SKIP line names the leaf AND the backend's own sentence, and the summary
    // carries the skip count beside the pass count.
    expect(SWEEP_SOURCE).toContain('"$path" "$reason"');
    // 🚨 THE COUNT NOW CARRIES ITS DENOMINATOR. `5 skip` is a numerator, and a
    // numerator alone cannot separate the skips somebody declared from the ones
    // that arrived on their own — which is exactly how four leaves went dark
    // with nothing to point at. A bare `$SKIP skip` must not come back.
    expect(SWEEP_SOURCE).toMatch(
      /\$PASS pass · \$SKIP\/\$DECLARED_TOTAL declared skip · \$WARN warn · \$FAIL fail/
    );
    expect(SWEEP_SOURCE).not.toMatch(/\$PASS pass · \$SKIP skip/);
  });

  // ── The declaration ───────────────────────────────────────────────────────

  it("FAILS a skip nobody declared — the phrase says it is policy, not that it is accepted", () => {
    // The matcher above answers "is this refusal environment policy". That is a
    // fact about the RESPONSE. Whether the resulting coverage loss is ACCEPTED is
    // a fact about this repository, and only `SWEEP_EXPECTED_SKIPS` carries it.
    // Before this branch the two were the same answer, so a leaf going dark cost
    // its whole coverage and moved one digit in a line nobody reads.
    const branch = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf(CALL),
      SWEEP_SOURCE.indexOf("# One pass answers both questions")
    );

    expect(branch).toMatch(/if\s+\[\[\s+"\$expected_skip"\s+!=\s+"true"\s+\]\]/);
    expect(branch).toContain("UNDECLARED SKIP");
    // It must name the remedy where the person reading the red is standing.
    expect(branch).toContain("SWEEP_EXPECTED_SKIPS");
  });

  it("derives that declaration rather than restating it, and REFUSES on a failed derivation", () => {
    // Same discipline as the safe-leaf and fixture lists: a derivation that
    // failed must never degrade into an empty set. An empty expected-skip set
    // makes every skip undeclared, so the failure direction here is loud rather
    // than silent — but it would be loud for a reason that says nothing about
    // the environment, which is its own kind of untrustworthy red.
    expect(SWEEP_SOURCE).toMatch(
      /EXPECTED_SKIPS_RAW=\$\(.*--print-expected-skips\s+2>"\$SKIPS_STDERR"\)/
    );
    expect(SWEEP_SOURCE).toMatch(/^SKIPS_EXIT=\$\?$/m);

    const refusal = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf("SKIPS_EXIT=$?"),
      SWEEP_SOURCE.indexOf("is_fixture_backed()")
    );
    expect(refusal).toMatch(/if\s+\[\[\s+\$SKIPS_EXIT\s+-ne\s+0\s+\]\]/);
    expect(refusal).toContain("could not derive the expected-skip list");
    // BOTH streams — `pnpm exec` names an unresolvable tool on STDOUT, which
    // `$(...)` traps in the variable rather than letting it reach the log.
    expect(refusal).toMatch(/printf '%s\\n' "\$EXPECTED_SKIPS_RAW"/);
    expect(refusal).toContain('cat "$SKIPS_STDERR"');
    expect(refusal).toMatch(/exit 7/);

    // And the derived list has to reach the membership test that decides the
    // third argument — the link that makes all of the above load-bearing.
    const membership = SWEEP_SOURCE.slice(
      SWEEP_SOURCE.indexOf("is_expected_skip()"),
      SWEEP_SOURCE.indexOf("ELAPSED=")
    );
    expect(membership).toMatch(/done\s*<<<\s*"\$EXPECTED_SKIPS_RAW"/);
    expect(membership).toMatch(/is_expected_skip\s+"\$leaf"\s+&&\s+expected=true/);
    expect(membership).toMatch(/run_leaf "\$leaf" true "\$expected"/);
    expect(membership).toMatch(/run_leaf "\$leaf" false "\$expected"/);
  });

  it("declares exactly the leaves the sweep executes — a declaration for anything else is drift", async () => {
    const report = await classifyCommandUniverse();

    // Every declared skip is a leaf the sweep RUNS. A declaration naming a leaf
    // that is `registration-only`, renamed or deleted would sit there excusing
    // whatever later takes that name.
    expect(report.staleExpectedSkips).toEqual([]);
    for (const path of report.expectedSkips) {
      expect(report.safe).toContain(path);
    }

    // A control on that loop: an empty `expectedSkips` would satisfy it while
    // asserting nothing, and the declaration is non-empty today.
    expect(report.expectedSkips.length).toBeGreaterThan(0);
    // The leaf whose loss is largest, because it is the only fixture-backed one:
    // its non-emptiness assertion is what the skip bypasses.
    expect(report.expectedSkips).toContain("role job-types");
    expect(report.fixtureBacked).toContain("role job-types");
  });

  it("keeps SKIP out of the exit code in BOTH modes — a policy gap is not a regression", () => {
    // SKIP must not count toward the failure total, or this whole change would
    // have moved the redness rather than removed it. Both exit expressions are
    // asserted: the default mode and `--strict`, which CI runs.
    // The `--strict` exit sits inside an `if`, so it is INDENTED. An anchor of
    // `^exit` matches only the default-mode line and the loop below then passes
    // over a single element while reading as a check on both.
    const exits = [...SWEEP_SOURCE.matchAll(/^\s*exit .*$/gm)].map((m) => m[0].trim());

    // A control on the extraction. Zero matches would vacuously satisfy the
    // loop below, so the count is asserted before its contents are.
    expect(exits).toContain("exit $(( FAIL + WARN ))");
    expect(exits).toContain('exit "$FAIL"');

    for (const line of exits) {
      expect(line).not.toContain("SKIP");
    }
  });
});
