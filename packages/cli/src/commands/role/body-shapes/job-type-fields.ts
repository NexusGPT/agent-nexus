import type {
  RoleJobTypeBasis,
  RoleJobTypeBody,
  RoleJobTypeGroup,
  RoleJobTypePart
} from "@agent-nexus/sdk";

import { CONTINUATION } from "./key-column";
import { renderUnion } from "./render-union";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * EVERY LIST IN THIS FOLDER IS A `Record` OVER AN SDK TYPE, AND THAT IS THE POINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A `--body` command's help can only be wrong in one way: it can name fewer
 * fields than the server requires. That is not a cosmetic failure — the route
 * refuses the request, the caller reads a validation error naming a field no
 * surface ever mentioned, and the only offered route out is "read an existing
 * one", which does not exist in an organization that has none. `create-job-type`
 * shipped exactly that: the Notes said "every field is required" and named five
 * of eleven.
 *
 * So each list is keyed by an SDK type rather than typed as prose:
 *
 * - a field ADDED to the SDK type is a compile error here until it carries a
 *   line, so the help cannot fall behind the contract;
 * - a field REMOVED is a `TS2353` on this object, so the help cannot describe a
 *   key the server would now refuse.
 *
 * ⚠️ THE GATE PROVES THE KEY SET, NEVER THE SENTENCE. A line saying `fte number`
 * where the contract says `number | null` compiles perfectly. The nullability
 * and the "null is not zero" statements are read from the schema by hand and are
 * pinned by `role-body-shapes.test.ts` against the SDK's own doc comments where
 * that is possible, and by a reader where it is not.
 */

/** Every basis, as a runtime lookup so the help can enumerate them. */
export const ROLE_JOB_TYPE_BASES: Record<RoleJobTypeBasis, true> = {
  SALARY: true,
  HOURLY: true,
  SEAT: true,
  DAY: true,
  UNIT: true,
  FIXED: true,
  CREDIT: true,
  CUSTOM: true
};

/** Every Scope-tab heading a job type can subtotal under. */
export const ROLE_JOB_TYPE_GROUPS: Record<RoleJobTypeGroup, true> = {
  PEOPLE: true,
  PARTNERS: true,
  PLATFORM: true,
  CREDITS: true
};

/** One rate input of a job type. `unit` is the one callers omit. */
export const JOB_TYPE_PART_FIELDS: Record<keyof RoleJobTypePart, string> = {
  key: 'string   what an expression calls this term: "salary"',
  label: 'string   what a human sees beside it: "Gross salary"',
  unit: `string   how it reads: "EUR a year", "%".\n${CONTINUATION}"" is legal.`,
  source: "the tagged union below. The tag IS the whole field."
};

/**
 * The whole of `POST/PUT /roles/job-types`, field by field.
 *
 * 🚨 EVERY ONE OF THESE IS REQUIRED, INCLUDING THE NULLABLE ONES. The schema is
 * a `strictObject` with no `.optional()` anywhere, so an omitted key is a 400
 * naming it — `null` is how a caller says "none", and it is never `0` and never
 * an absent key. Five of these were undocumented until 2026-08-13.
 */
export const JOB_TYPE_BODY_FIELDS: Record<keyof RoleJobTypeBody, string> = {
  name: 'string   "Support agent, Manila"',
  basis: `one of ${renderUnion(ROLE_JOB_TYPE_BASES, 46)}`,
  group: `one of ${renderUnion(ROLE_JOB_TYPE_GROUPS)}`,
  category: 'string   the band in the "Add a line" picker',
  quantityUnit: 'string   what ONE unit IS: "people", "seats", "h / wk"',
  note: "string|null   the author's own sentence",
  fte: `number|null   null is a FULL contract, NEVER 0.\n${CONTINUATION}0 < fte <= 1`,
  parts: "Part[]   at least one; the shape is below",
  costExpression: "string|null   null uses the basis' built-in expression",
  hoursExpression: "string|null   null uses the basis' built-in expression",
  revenueExpression: "string|null   null when the type credits nothing back"
};
