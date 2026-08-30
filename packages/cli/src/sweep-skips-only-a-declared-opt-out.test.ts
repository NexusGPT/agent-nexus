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
 * The regex is extracted from `sweep.sh` and executed with the same `grep -E`
 * the script uses, rather than restated here. A copy in this file would be a
 * second place for the rule to live, and the copy would keep passing after the
 * original was broadened — the spec would go green about a matcher nothing runs.
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

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const SWEEP_SOURCE = readFileSync(SWEEP, "utf8");

/**
 * The live skip pattern, lifted from `sweep.sh` rather than restated.
 *
 * Anchored on the `-qE '<pattern>'` form the script actually runs. A failure to
 * find it is thrown rather than defaulted: a spec that silently fell back to a
 * hardcoded pattern would keep asserting after the script stopped containing
 * one, which is the exact false green this file is about.
 */
function skipPattern(): string {
  const match = SWEEP_SOURCE.match(/grep -qE '("message":[^']+)'/);
  if (!match) {
    throw new Error(
      "Could not find the SKIP matcher in sweep.sh. If the `grep -qE '\"message\"...'` " +
        "form moved, update this extraction — do NOT inline a copy of the pattern here."
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
    const branch = SWEEP_SOURCE.slice(SWEEP_SOURCE.indexOf(skipPattern()));
    const untilReturn = branch.slice(0, branch.indexOf("return"));
    expect(untilReturn).toContain("printf 'SKIP|%s|%s\\n'");
  });

  it("reports the skip with its reason, so a shrunken suite cannot read as a green one", () => {
    // A silently-omitted case is indistinguishable from one that passed. The
    // SKIP line names the leaf AND the backend's own sentence, and the summary
    // carries a skip count beside the pass count.
    expect(SWEEP_SOURCE).toContain('printf \'SKIP|%s|%s\\n\' "$path" "$reason"');
    expect(SWEEP_SOURCE).toMatch(/\$PASS pass · \$SKIP skip · \$WARN warn · \$FAIL fail/);
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
