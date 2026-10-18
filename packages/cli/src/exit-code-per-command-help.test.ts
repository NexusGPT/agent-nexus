import { describe, expect, it } from "vitest";

import { renderedHelp } from "./exit-code-sources.testkit";

/**
 * NO COMMAND'S HELP NAMES A SPECIFIC EXIT CODE EXCEPT THE THREE THAT OWN ONE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 "EXITS 1" WAS TRUE OF EVERY FAILURE AND IS NOW TRUE OF ALMOST NONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue's "EVERY failure exits 1" was the loudest copy of that claim
 * and not the only one: a dozen commands told a reader, in their own `--help`,
 * that a particular failure exits `1`. Each was true when written. After the
 * taxonomy a validation refusal exits `5`, a not-found exits `4` and a server
 * failure exits `6`, so every one of those sentences became a promise the binary
 * breaks — the same defect this change set exists to remove, spread across the
 * tree instead of concentrated in one epilogue.
 *
 * THE RULE: only three surfaces may print an exit NUMBER, and each is joined to
 * the code by a case — the root, which owns the table; `admin`, whose table
 * `admin-help-exit-table.test.ts` asserts against `exitCodeForHttpStatus`; and
 * `upgrade`, whose four outcomes are the CLI's only per-command exit contract.
 * The root's case is `the root --help exit-code table is true of the code` in
 * `exit-code-taxonomy.test.ts`; `upgrade`'s two named outcomes are bound to
 * their categories in `exit-code-reachability.test.ts`.
 *
 * Everywhere else a failure is described as NON-ZERO, which stays true however
 * the category is later refined. That is not vagueness — it is the only claim a
 * per-command help screen is in a position to make correctly.
 *
 * Read off the RENDERED help, never the source, because rendered text is what a
 * user acts on and a `.description()` string reaches the screen from anywhere.
 */
const HELP_MAY_NAME_AN_EXIT_CODE: ReadonlySet<string> = new Set(["nexus", "admin", "upgrade"]);

describe("no per-command help promises an exit code the taxonomy may refine", () => {
  it("renders a real tree — an empty walk must not read as compliance", () => {
    expect(renderedHelp().length).toBeGreaterThan(100);
  });

  it("actually captures the epilogues, where every exit sentence lives", () => {
    // The anti-vacuity control, and it is not decoration: `helpInformation()`
    // renders a complete-looking help screen with every `addHelpText` block
    // MISSING, so a walk over it is green having read none of the prose under
    // test. This asserts the renderer sees a sentence that only exists in the
    // root epilogue.
    const root = renderedHelp().find(([path]) => path === "nexus");
    expect(root?.[1]).toContain("EVERY failure exits NON-ZERO");
  });

  it("names an exit number only on the three surfaces joined to the code", () => {
    // WHAT COUNTS AS NAMING AN EXIT CODE, AND WHY IT IS A WINDOW.
    //
    // Two matchers were tried against the real corpus and rejected, in opposite
    // directions:
    //
    //   `exits N` / `exit code N` ONLY \u2014 went GREEN over "the exit code names
    //   the category \u2014 6 when \u2026, 5 when \u2026" in `mcp call --help`, a line this
    //   very rule forbids, written by the commit that installed the rule. A
    //   matcher keyed to the phrasings its author thought of passes the
    //   counterexample.
    //
    //   ANY non-zero integer on a line mentioning exit \u2014 4 findings, 4 FALSE: a
    //   `100` percent, two `2 minutes` durations and an HTTP `200`. A gate whose
    //   reds are mostly wrong is a gate somebody loosens at the wrong moment,
    //   which is a thing this file argues about its own subject.
    //
    // So: a non-zero integer in the WINDOW AFTER the word "exit". Every false
    // positive above sat BEFORE it, describing something else; a number offered
    // after it is being offered as the code. `0` is exempt throughout \u2014 success
    // is the one category that cannot be refined, so "exits 0" stays true.
    const offenders: string[] = [];
    for (const [path, help] of renderedHelp()) {
      if (HELP_MAY_NAME_AN_EXIT_CODE.has(path.split(" ")[0] ?? "")) continue;
      for (const line of help.split("\n")) {
        const anchor = /\bexit(?:s|ed|ing)?\b/i.exec(line);
        if (anchor === null) continue;
        const after = line.slice(anchor.index, anchor.index + 60);
        // Not an HTTP status, and not a number carrying a unit.
        const named = [
          ...after.matchAll(
            /(?:^|[^\w.-])(?<!HTTP )([1-9]\d*)(?![\w.-])(?!\s*(?:%|m?s\b|min|sec|hour|day|[KMG]B))/g
          )
        ].map((match) => match[1]);
        // `130` IS EXEMPT ON THE SAME GROUND AS `0`, AND FOR THE SAME ONE LINE
        // OF REASONING: the rule exists because a per-command help promising a
        // number goes false when the taxonomy refines that failure into a more
        // specific category. `0` cannot be refined, and neither can `130` —
        // `exitCodeTaxonomyViolations()` pins it to `128 + 2` and refuses any
        // other declared code in the shell's band, so the one command that
        // produces it may say so. Filtered rather than skipped: a line naming
        // `130` AND a refinable number is still a finding.
        const refinable = named.filter((value) => value !== "130");
        if (refinable.length === 0) continue;
        offenders.push(`nexus ${path}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
