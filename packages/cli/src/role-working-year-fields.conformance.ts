import {
  OrganizationAutomationSettingsInputSchema,
  RoleWorkingYearInputSchema
} from "@nexus/types/domain";

/**
 * A ROLE'S WORKING YEAR AND AN ORGANIZATION'S WORKING-TIME MODEL HOLD DISJOINT
 * TERMS — read off the contracts rather than written down.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `wire-types-bundle.test.ts` allows exactly one kind of file to import
 * `@nexus/types`: a `*.conformance.ts`, none of which is reachable from
 * `src/index.ts`. The rule is deliberately stricter than reachability, because
 * `@nexus/types` pulls Zod and the generated Prisma enums and that is the +5MB
 * the CLI's standalone publishing model exists to avoid. This module obeys that
 * rule rather than arguing with it: it is a drift gate's data, it imports the
 * real contracts, and the binary cannot reach it.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * `nexus role`'s working-year help rests on a claim about the DOMAIN: that no
 * organization setting holds a calendar year, paid leave, public holidays or
 * sickness, so a blank term has nothing to fall back to. Both commands said the
 * opposite until 2026-08-14 and printed `(org default)` for every unstated term.
 *
 * 🚨 A HAND-WRITTEN LIST WOULD MAKE THE GATE A CHANGE DETECTOR FOR ITS OWN COPY
 * OF THE FACT. The claim is not "these eight field names"; it is "these two rows
 * share nothing", and the day they DO share one is the day an organization
 * default becomes a real thing to offer and the copy has to change. Deriving
 * both sides is what makes `role-help-offers-no-absent-fallback.test.ts` measure
 * the system instead of measuring a comment.
 */

/** The four terms a Role's working year is built from. */
export const ROLE_WORKING_YEAR_TERMS: readonly string[] = Object.keys(
  RoleWorkingYearInputSchema.shape
);

/** Everything an organization can state about working time, currency included. */
export const ORGANIZATION_WORKING_TIME_TERMS: readonly string[] = Object.keys(
  OrganizationAutomationSettingsInputSchema.shape
);
