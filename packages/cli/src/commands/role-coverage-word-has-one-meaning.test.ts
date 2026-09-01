import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { describe, expect, it } from "vitest";

import { roleHelpText as helpText, roleSubcommands } from "./role-help.testkit";

/**
 * ONE WORD, ONE MEANING, ACROSS `nexus role`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * "Coverage" named two different things on commands an operator reads side by
 * side. THE AUTOMATION FIGURE — person-hours automated over person-hours worked,
 * what `nexus role coverage` returns. And THE TASK↔DUTY CHECKLIST — which duties
 * a task ticks off, which has nothing to do with any figure.
 *
 * This is the harder sibling of the false-coverage-effect defect fixed just
 * before it. There, five help strings claimed an effect the server does not
 * have, and each sentence was false on its own. Here **every sentence is true**.
 * The reader is the only thing that breaks: `remove-responsibility` said it
 * unticks the duty "from every task that COVERED it" three screens from a
 * command whose whole subject is a coverage percentage.
 *
 * ── WHY THE FIGURE KEEPS THE WORD, ON EVIDENCE RATHER THAN SENIORITY ─────────
 *
 * The automation sense owns IDENTIFIERS and the checklist sense owns none:
 *
 *   - `role_coverage:read` — a PUBLISHED public-API scope string. Renaming it
 *     breaks every API key already holding it.
 *   - `coverage.view` / `coverage.manage` — capability strings that gate real
 *     requests.
 *   - the `nexus role coverage` command, `RoleCoverageView`, the
 *     `shared/domain/role-coverage/` tree, `GetRoleCoverageUseCase`.
 *
 * A search for a checklist-sense identifier returns nothing: it was prose in
 * two help strings and nowhere else. So the cheap side to move is the checklist
 * side, and it is cheap because it is words — not because it is newer.
 *
 * The checklist sense is now "the duty checklist", and a task "ticks" a duty.
 * That reuses the metaphor the same paragraph already used ("unticks"), and
 * "duty" is the word every one of these commands already prints.
 *
 * ── THE RULE IS OVER THE NAMESPACE, NOT OVER TWO STRINGS ────────────────────
 *
 * The command set below is DERIVED from the registrar, never typed. So a
 * command added tomorrow is judged the day it exists, and the only way to use
 * the word in it is to add it to `MAY_NAME_THE_FIGURE` deliberately, with a
 * reason.
 *
 * ⚠️ WHAT THIS CANNOT REACH: `role.ts`'s module docblock, which is source rather
 * than rendered help. It carried a third sense — a table row reading
 * "— not covered —" for a surface this CLI does not expose — corrected in the
 * same commit and pinned by nothing. A reader of that table is a maintainer, not
 * a caller, which is the only reason it is acceptable to leave unpinned.
 */

/**
 * The four spellings, as one alternation.
 *
 * 🚨 A FIXED STRING IS NOT ENOUGH AND THAT IS NOT HYPOTHETICAL. The defect was
 * reported as the noun "coverage"; the second instance was the VERB, "every task
 * that COVERED it", which a `grep -F "coverage"` never sees. A sweep's control
 * proves the sweep ran — it can never prove the pattern covers the phrasings.
 *
 * `\b` before `cover` is load-bearing: without it this matches "discovered",
 * which `set-automation-settings` and `update-job-type` both use innocently.
 * Verified against discovered / rediscover / uncovered / recovery / undercover.
 */
const COVERAGE_WORD = /\bcover(age|s|ed|ing)?\b/i;

/**
 * The commands whose help may name the automation figure, and why each may.
 *
 * Everything else in the namespace must be silent about it. The reasons are not
 * decoration: they are what stops the next reader adding an entry to make a red
 * go away.
 */
/**
 * THE MOST COMMANDS THIS LIST MAY ALLOW, AS A LITERAL SOMEBODY RAISES BY HAND.
 *
 * The header above says the reasons are what stops the next reader adding an
 * entry to make a red go away — and a well-written reason does not stop it, it
 * satisfies it. The offender arm exempts whatever is in this map, so the command
 * and the entry that allows it land in one commit with everything green.
 *
 * This list is the measure of how many places the word is allowed to mean the
 * automation figure. An UPPER BOUND, so removing the word from a command's help
 * takes its entry and this figure down together, in silence.
 */
const MAY_NAME_THE_FIGURE_CEILING = 13;

const MAY_NAME_THE_FIGURE: Readonly<Record<string, string>> = {
  coverage: "it IS the figure",
  "automation-settings": "reads the one coverage input this API can write",
  "set-automation-settings": "writes it, and moves the figure for every Role at once",
  // The seven job-model writes carry the shared statement that names the figure
  // in order to DENY moving it. That sentence is the whole point of them.
  "create-job-type": "carries the job-model disclaimer",
  "update-job-type": "carries the job-model disclaimer",
  "delete-job-type": "carries the job-model disclaimer",
  "set-scope-lines": "carries the job-model disclaimer",
  "set-variables": "carries the job-model disclaimer",
  "set-working-year": "carries the job-model disclaimer",
  "set-system-policy": "carries the job-model disclaimer",
  // 🔑 THE ONE ENTRY THAT IS NEITHER THE FIGURE NOR A DISCLAIMER: it MOVES the
  // figure, in both directions, and touches no model doing it. Only a LIVE
  // system is summed, so this write is the whole of the difference between
  // modelled coverage and live coverage — the automation sense in its strongest
  // form, which is why "coverage buckets" is the honest name for what it moves
  // a system between. Silence here would be the defect: a caller who cannot see
  // that this changes the published percentage is exactly the caller who
  // retires a system to tidy an inventory.
  "set-system-lifecycle": "moves the figure in both directions, without touching a model",
  // These two render the CAPABILITY enum out of the v1 contract, and
  // `coverage.view` / `coverage.manage` are in it. That is the automation sense
  // appearing as an identifier — the docblock above names those two strings as
  // evidence the figure owns the word — so it is the SAME meaning, not a second
  // one. Nothing here is prose that a reader could take the checklist way, and
  // the values are generated, so they cannot be reworded on this side anyway.
  "create-permission-set": "renders the contract's capability enum, which contains coverage.view",
  "update-permission-set": "renders the contract's capability enum, which contains coverage.view"
};

describe("nexus role — the coverage word names the automation figure and nothing else", () => {
  const subcommands = roleSubcommands();

  it("the namespace was enumerated, not assumed", () => {
    // A derived list that resolved to nothing satisfies every per-command
    // assertion below by having none to make. This is the control that
    // separates "no command misuses the word" from "no command was read".
    expect(subcommands.length).toBeGreaterThan(30);
  });

  it("every allowed command exists", () => {
    // A stale entry here is a command that was renamed. The new name would be
    // judged as forbidden and go red, which is correct — but the dead entry
    // would sit here reading as deliberate, so it is caught on its own.
    const registered = new Set(subcommands.map((cmd) => cmd.name()));
    const stale = Object.keys(MAY_NAME_THE_FIGURE).filter((name) => !registered.has(name));

    expect(
      stale,
      `MAY_NAME_THE_FIGURE names commands that do not exist: ${stale.join(", ")}`
    ).toEqual([]);
  });

  it.each(
    eachOrRefuse(
      shrinkOnlyLedger({
        // EVERY registered subcommand is the drain-proof control, never the ones
        // that name the word: a command whose help stops naming it is still a
        // command, so this population survives the cure and its coverage arm gets
        // stronger with every scrub.
        population: "`nexus role` commands whose help names the automation figure",
        findings: subcommands.filter((cmd) => COVERAGE_WORD.test(helpText(cmd))),
        keyOf: (cmd) => cmd.name(),
        locate: (cmd) => {
          const line = helpText(cmd)
            .split("\n")
            .find((l) => COVERAGE_WORD.test(l));
          return `nexus role ${cmd.name()} — ${(line ?? "").trim()}`;
        },
        ledgerKeys: Object.keys(MAY_NAME_THE_FIGURE),
        ceiling: MAY_NAME_THE_FIGURE_CEILING,
        remedy:
          "This command cannot reach the automation figure, so the word means something else\n" +
          "  in its help and a reader has no way to tell which. Say what it actually means, in\n" +
          "  its own words.\n" +
          "  A row here is a deliberate second sense, and its reason has to say what the\n" +
          "  command's relationship to the figure IS.",
        drainProofControl: {
          name: "`nexus role` subcommands the CLI registers",
          keys: subcommands.map((cmd) => cmd.name()),
          floor: 30
        },
        rowCheck: {
          name: "every allowed command carries a reason",
          offender: (name) => {
            const reason = MAY_NAME_THE_FIGURE[name];
            if (reason === undefined) return `${name} — no reason at all`;
            return reason.trim().length === 0 ? `${name} — reason is blank` : null;
          }
        }
      }).checks.map((check) => [check.name, check] as const),
      "the checks shrinkOnlyLedger builds — a FIXED set of rows, never derived from the ledger, so it cannot empty when the ledger does"
    )
  )("%s", (_name, check) => {
    expect(check.actual, check.message).toEqual(check.expected);
  });

  it("every allowed command's help still uses it — a blanket scrub must fail", () => {
    // The other direction, and the reason this is a fix rather than a sweep.
    // Deleting the word everywhere satisfies the assertion above completely,
    // and would take the one honest statement — that writing the job model does
    // NOT move the figure — out of all seven writes that need it.
    const silent = subcommands
      .filter((cmd) => cmd.name() in MAY_NAME_THE_FIGURE)
      .filter((cmd) => !COVERAGE_WORD.test(helpText(cmd)))
      .map(
        (cmd) => `nexus role ${cmd.name()} (allowed because: ${MAY_NAME_THE_FIGURE[cmd.name()]})`
      );

    expect(
      silent,
      silent.length === 0
        ? ""
        : "These reach the automation figure and say nothing about it:\n  " + silent.join("\n  ")
    ).toEqual([]);
  });

  it("the checklist sense is stated in its own words", () => {
    const byName = new Map(subcommands.map((cmd) => [cmd.name(), cmd]));
    const add = byName.get("add-responsibility");
    const remove = byName.get("remove-responsibility");
    if (!add || !remove) throw new Error("the duty commands are not registered under these names");

    // Positive assertions, not merely the absence above: a reader still has to
    // be told what the thing IS, and "duty checklist" / "ticked" is the wording
    // the rest of these two help texts already use.
    expect(helpText(add)).toMatch(/duty checklist/i);
    expect(helpText(remove)).toMatch(/ticked it/i);
  });
});
