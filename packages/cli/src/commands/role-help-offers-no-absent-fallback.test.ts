import { describe, expect, it } from "vitest";

import {
  ORGANIZATION_WORKING_TIME_TERMS,
  ROLE_WORKING_YEAR_TERMS
} from "../role-working-year-fields.conformance";
import { flatHelp, roleHelpIsRendered, roleHelpText, roleSubcommands } from "./role-help.testkit";

/**
 * `nexus role` MAY NOT SEND A READER TO AN ORGANIZATION VALUE THAT DOES NOT
 * EXIST.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus role working-year` printed `(org default)` for every unstated term, and
 * both working-year commands told the reader in prose that a blank term falls
 * back to "the organization's value". **No such value exists.** The two rows
 * hold disjoint quantities and always have:
 *
 *   `RoleWorkingYear`                 calendarWeeks, paidLeaveWeeks,
 *                                     publicHolidayDays, sicknessDays
 *   `OrganizationAutomationSettings`  hoursPerDay, daysPerWeek,
 *                                     workingWeeksPerYear, currency
 *
 * So a reader who left a term blank believed an organization number was standing
 * in for it. Nothing was standing in for it. `null` is stored, `null` is read
 * back, and every consumer treats it as "not stated" — which is what the domain
 * entity says it means, and what the `PUT /public/v1/roles/:roleId/working-year`
 * description says it means. The CLI was the one surface that disagreed, and it
 * disagreed on the channel a caller actually reads.
 *
 * ── WHY THIS IS THE SIBLING OF `role-coverage-help-is-true.test.ts` ───────────
 *
 * That test came out of a pass asking **"does this help claim an EFFECT the
 * server does not have"**. Five sentences did. This is the question that pass did
 * not ask: **"does this help name a VALUE that does not exist"**. Same file, same
 * command, same reader — the sentence survived a commit that was correcting the
 * paragraph immediately below it, because nothing was looking for it.
 *
 * ── WHY BOTH FIELD SETS ARE DERIVED AND NEITHER IS TYPED HERE ────────────────
 *
 * 🚨 A HAND-WRITTEN LIST WOULD MAKE THIS A CHANGE DETECTOR FOR ITS OWN COPY OF
 * THE FACT. The claim is not "these eight field names"; it is "these two rows
 * share nothing", and the day they DO share something is the day an organization
 * default becomes a real thing to offer and a human should decide what the copy
 * says. Deriving both sides from `@nexus/types` is what makes this measure the
 * system rather than measure a comment.
 *
 * ── THE SWEEP FOUND A SECOND ROW ON ITS FIRST LIVE RUN ───────────────────────
 *
 * `nexus role system-policy` said an unauthored policy means "read the
 * organization's defaults". **There is no organization-level system policy
 * either.** `allowProposals` occurs exactly ONCE in `schema.prisma`, inside
 * `RoleSystemPolicy`, and the entity's own docblock says "five booleans, one row
 * per Role". The `@default(true)` column defaults are what Postgres writes when a
 * ROW is created; they are not a value an organization states and not something
 * an absent row inherits.
 *
 * That is why this file is a SWEEP over the namespace and not two assertions
 * about the working year. The working-year intersection below is the half that
 * can be DERIVED; the sweep is what finds the next one. It found the second
 * instance before any human read for it.
 *
 * ⚠️ WHAT THIS CANNOT REACH. It reads rendered `--help` and nothing else. The
 * `(org default)` STRING itself was not in the help — it was a runtime rendering
 * the command produces only with a response in hand, so this gate is blind to it
 * by construction. `role.test.ts` covers that surface by running both commands
 * against a mocked client. Two surfaces, two tests, and this paragraph is the
 * only place that says which is which.
 */

/**
 * Both field sets, read off the real contracts.
 *
 * They come through `role-working-year-fields.conformance.ts` rather than from a
 * direct import: `wire-types-bundle.test.ts` allows `@nexus/types` in a
 * conformance module and nowhere else, because the package pulls Zod and the
 * generated Prisma enums and the CLI publishes standalone. That module's header
 * carries the argument; this line is only where it lands.
 */
const WORKING_YEAR_TERMS = ROLE_WORKING_YEAR_TERMS;
const ORGANIZATION_TERMS = ORGANIZATION_WORKING_TIME_TERMS;

/**
 * The spellings a fallback claim is made in, as one alternation.
 *
 * 🚨 A FIXED STRING IS NOT ENOUGH, AND THAT IS NOT HYPOTHETICAL. The defect was
 * spelled THREE ways in one command: `(org default)` in the rendered output, "the
 * organization's value applies" in one Notes block, and `--sickness none says
 * "use the organization's value"` in another. A `grep -F "(org default)"` sees
 * one of the three.
 *
 * The British spelling is included because `apps/frontend` uses it throughout and
 * a sentence moved between the two surfaces would otherwise walk through this
 * gate. Verified NOT to match the innocent neighbours in this same namespace —
 * "the organization's AUTOMATION SETTINGS", "job types are org-wide", "the
 * organisation's terms" — every one of which is a true statement about a row an
 * organization really does hold.
 */
const CLAIMS_AN_ORGANIZATION_FALLBACK =
  /\(org default\)|organi[sz]ation(?:'s)?\s+(?:value|default)|org\s+default/i;

describe("nexus role — no help offers a fallback the system does not hold", () => {
  it("holds no term an organization can also state — the fact the copy rests on", () => {
    // The control: both sides must be non-empty, or an empty intersection is
    // evidence that an import broke rather than evidence about the domain.
    expect(WORKING_YEAR_TERMS.length).toBeGreaterThan(0);
    expect(ORGANIZATION_TERMS.length).toBeGreaterThan(0);

    const shared = WORKING_YEAR_TERMS.filter((term) => ORGANIZATION_TERMS.includes(term));

    expect(
      shared,
      "An organization can now state a working-year term. `nexus role`'s " +
        "working-year copy says it cannot, and so do " +
        "`apps/backend/src/roles/domain/entities/role-working-year.entity.ts` and the " +
        "`PUT /public/v1/roles/:roleId/working-year` description in " +
        "`packages/types/src/api/public/v1/contract/roles.ts`. Correct all three in " +
        "this PR, then widen this gate deliberately."
    ).toEqual([]);
  });

  it("is never offered as a fallback by any `role` subcommand's help", () => {
    // CONTROL 1 — the help really is rendered with its `addHelpText` handlers.
    // Written with `helpInformation()`, this test passed while the forbidden
    // sentence sat in the Notes block. See `role-help.testkit.ts`.
    const rendered = roleHelpIsRendered();
    expect(rendered.full.length).toBeGreaterThan(rendered.withoutHandlers.length);
    expect(rendered.full).toContain("NOT STATED");
    expect(rendered.withoutHandlers).not.toContain("NOT STATED");

    // CONTROL 2 — a denominator, so a registrar that silently stopped
    // registering cannot read as a clean sweep.
    const commands = roleSubcommands();
    expect(commands.length).toBeGreaterThan(40);

    const offenders = commands
      .filter((command) => CLAIMS_AN_ORGANIZATION_FALLBACK.test(flatHelp(roleHelpText(command))))
      .map((command) => command.name());

    expect(
      offenders,
      "These commands tell the reader a value falls back to the organization. " +
        "No organization row holds a calendar year, paid leave, public holidays " +
        "or sickness — see the first test in this file, which derives that from " +
        "`@nexus/types` rather than asserting it."
    ).toEqual([]);
  });
});
