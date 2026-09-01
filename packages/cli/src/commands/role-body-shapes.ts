import type {
  CoverageMoneyNotModelledReason,
  CoverageNotModelledReason,
  CoverageSavingsProjectionUnavailableReason,
  RoleJobTypeBasis,
  RoleJobTypeBody,
  RoleJobTypeGroup,
  RoleJobTypePart,
  RoleScopeLineInput,
  RoleVariableInput
} from "@agent-nexus/sdk";

/**
 * The BODY SHAPES `nexus role`'s `--body` commands accept, rendered for `--help`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EVERY LIST HERE IS A `Record` OVER AN SDK TYPE, AND THAT IS THE WHOLE POINT
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
 * So each list below is keyed by an SDK type rather than typed as prose:
 *
 * - a field ADDED to `RoleJobTypeBody` is a compile error here until it carries
 *   a line, so the help cannot fall behind the contract;
 * - a field REMOVED is a `TS2353` on this object, so the help cannot describe a
 *   key the server would now refuse.
 *
 * That is the same gate `ROLE_RESOURCE_TYPES` in `role.ts` already applies to
 * the resource-type list, applied to the thing a caller actually has to compose.
 * Nothing else binds a Notes block to a schema — which is why the wrong count
 * survived review.
 *
 * ⚠️ THE GATE PROVES THE KEY SET, NEVER THE SENTENCE. A line saying `fte number`
 * where the contract says `number | null` compiles perfectly. The nullability
 * and the "null is not zero" statements are read from the schema by hand and are
 * pinned by `role-body-shapes.test.ts` against the SDK's own doc comments where
 * that is possible, and by a reader where it is not.
 */

/** Indent every field line by four, and align the descriptions past the keys. */
const KEY_COLUMN = 20;

/**
 * Where a field line's description starts — four of indent plus the key column.
 *
 * Derived rather than typed, so a continuation line inside a description stays
 * aligned when `KEY_COLUMN` moves. Hand-counted spaces drifted by five the first
 * time this block was rendered.
 */
const CONTINUATION = " ".repeat(4 + KEY_COLUMN);

/**
 * Render one `Record<keyof T, string>` as an aligned block.
 *
 * The KEY comes from the record's own key, never from the description, so a
 * description cannot name a field the type does not have. A description may
 * carry its own newlines for a value that will not fit the remaining width; it
 * is the author's job to indent those continuations.
 */
function renderFields(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, description]) => `    ${key.padEnd(KEY_COLUMN)}${description}`)
    .join("\n");
}

/**
 * Render a closed union's members as a quoted alternation.
 *
 * Read off a `Record<Union, true>` for the reason the whole file exists: a value
 * added to the union is a compile error at the record rather than a `--help`
 * that omits it.
 */
function renderUnion(members: Record<string, true>, width = Infinity): string {
  const quoted = Object.keys(members).map((member) => JSON.stringify(member));
  const lines: string[] = [];
  let line = "";
  for (const member of quoted) {
    const candidate = line === "" ? member : `${line}|${member}`;
    if (candidate.length > width && line !== "") {
      lines.push(`${line}|`);
      line = member;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines.join(`\n${CONTINUATION}`);
}

/** Every basis, as a runtime lookup so the help can enumerate them. */
const ROLE_JOB_TYPE_BASES: Record<RoleJobTypeBasis, true> = {
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
const ROLE_JOB_TYPE_GROUPS: Record<RoleJobTypeGroup, true> = {
  PEOPLE: true,
  PARTNERS: true,
  PLATFORM: true,
  CREDITS: true
};

/** One rate input of a job type. `unit` is the one callers omit. */
const JOB_TYPE_PART_FIELDS: Record<keyof RoleJobTypePart, string> = {
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
const JOB_TYPE_BODY_FIELDS: Record<keyof RoleJobTypeBody, string> = {
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

/**
 * The whole of a scope line.
 *
 * `scope` is the field callers miss: it is REQUIRED, and there is no `note` on a
 * line — a body carrying one is refused by name, because the schema is strict.
 */
const SCOPE_LINE_FIELDS: Record<keyof RoleScopeLineInput, string> = {
  jobTypeId: 'uuid     from "nexus role job-types"',
  quantity: "number   how many units of that type. 0 is legal",
  scope: `string   REQUIRED. What this line covers, in words.\n${CONTINUATION}"" is legal.`
};

/**
 * The whole of one Role variable.
 *
 * 🚨 REQUIRED AND NULLABLE ARE NOT THE SAME PROPERTY, and this block exists
 * because the prose that stood here collapsed them: it said `label`,
 * `description` and `unit` were "required strings", when `RoleVariableInput`
 * types two of the three `string | null`. Omitting the KEY is a 400; sending
 * `null` for the VALUE is how a caller says "none". A reader who believed the
 * sentence had to invent a description for every variable that has none.
 */
const VARIABLE_FIELDS: Record<keyof RoleVariableInput, string> = {
  key: `string   what a part's source.variable matches: "wage".\n${CONTINUATION}Lower-case start, then word characters`,
  label: 'string   what the Assumptions tab calls it: "Hourly wage"',
  description: "string|null   the author's own sentence. null for none",
  unit: `string|null   how it reads: "€ / h", "%". A LABEL, and\n${CONTINUATION}nothing parses it. null for none`,
  value: "number|null   null is UNSET and is NEVER 0 — see below"
};

/** Every reason a Role has no coverage percentage at all. */
const COVERAGE_NOT_MODELLED_REASONS: Record<CoverageNotModelledReason, true> = {
  NO_WORKLOAD_MODEL: true,
  NO_WORKING_TIME_MODEL: true,
  WORKING_TIME_MODEL_INVALID: true,
  WORKLOAD_MODEL_INVALID: true,
  WORKLOAD_WRONG_DIMENSION: true,
  WORKLOAD_ZERO_HOURS: true,
  WORKLOAD_NEGATIVE_HOURS: true,
  WORKLOAD_WRONG_PERIOD_BASIS: true,
  RATIO_NOT_FINITE: true
};

/** Every reason a Role has no money figures at all. */
const COVERAGE_MONEY_NOT_MODELLED_REASONS: Record<CoverageMoneyNotModelledReason, true> = {
  NO_CURRENCY: true
};

/**
 * Every reason the saved hours cannot be re-expressed in money.
 *
 * 🚨 THE THIRD CLOSED VOCABULARY ON THIS ONE RESPONSE, and the help enumerated
 * the other two and stopped. `coverage` and `money` fail together in the common
 * case — an organization with no automation settings row answers
 * `NO_WORKING_TIME_MODEL` and `NO_CURRENCY` — so a caller who has cleared both
 * still meets `savingsProjection.kind: "unavailable"` on its own, over a
 * vocabulary neither of the other two names.
 *
 * 🚨 ONLY `NO_WORKLOAD_HOURS` IMPLIES THE PERCENTAGE IS ALSO ABSENT. The ratio
 * is hours over hours and reads neither a cost nor a currency, and
 * `RoleWorkload.costFormula` is nullable where `formula` is not — so a Role with
 * an authored workload and no cost model reports a real percentage beside an
 * unavailable projection. The other six arms are each reachable in that state,
 * which is why this list cannot be inferred from the two above it.
 */
const COVERAGE_SAVINGS_PROJECTION_UNAVAILABLE_REASONS: Record<
  CoverageSavingsProjectionUnavailableReason,
  true
> = {
  NO_CURRENCY: true,
  NO_WORKLOAD_COST: true,
  NEGATIVE_WORKLOAD_COST: true,
  NO_WORKLOAD_HOURS: true,
  RATE_NOT_FINITE: true,
  AMOUNT_NOT_FINITE: true,
  IMPACT_HOURS_UNAVAILABLE: true
};

/** Wrap a member list at `width`, indenting every continuation line. */
function wrapMembers(members: readonly string[], indent: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const member of members) {
    const candidate = line === "" ? member : `${line}, ${member}`;
    if (candidate.length > width && line !== "") {
      // The trailing comma is what says the list CONTINUES. Without it a wrapped
      // enumeration reads as several complete lists, which is the one thing this
      // block exists to prevent — a caller who stops at line one has an
      // incomplete vocabulary and no way to know it.
      lines.push(`${line},`);
      line = member;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines.map((entry) => `${indent}${entry}`).join("\n");
}

/**
 * Appended to `nexus role create-job-type` and `update-job-type`.
 *
 * The worked example is not decoration: the reporter who found this could not
 * compose a legal body from the Notes, and the fallback the Notes offered —
 * "read an existing one" — is unavailable in an organization whose library is
 * empty, which is every new organization.
 */
export const JOB_TYPE_BODY_SHAPE = `
  THE WHOLE BODY, AND EVERY KEY IS REQUIRED — the nullable ones included. Send
  null, never omit and never 0. The schema is strict, so an unknown key is
  refused by name.

${renderFields(JOB_TYPE_BODY_FIELDS)}

  A Part is:

${renderFields(JOB_TYPE_PART_FIELDS)}

  A PART'S SOURCE IS A TAGGED UNION, AND THE TAG IS THE WHOLE FIELD. Exactly two
  kinds, and no third:
    {"kind": "variable", "variable": "<part key>"}   resolved against the ROLE's
      own variables at evaluation time — which is why one org-wide job type
      prices differently in each Role
    {"kind": "fixed", "value": <number>}             a literal this type owns
  There is no "constant", no "literal" and no "variableRef" — the last is a
  database comment describing a design that never shipped.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"name":"Support agent","basis":"SALARY","group":"PEOPLE",
     "category":"PEOPLE","quantityUnit":"FTE","note":"","fte":null,
     "costExpression":null,"hoursExpression":"","revenueExpression":"",
     "parts":[{"key":"salary","label":"Salary","unit":"EUR a year",
               "source":{"kind":"fixed","value":50000}}]}`;

/** Appended to `nexus role set-scope-lines`. */
export const SCOPE_LINES_BODY_SHAPE = `
  THE BODY IS { "lines": [ Line, ... ] } and a Line is:

${renderFields(SCOPE_LINE_FIELDS)}

  THOSE THREE KEYS AND NO OTHERS. The schema is strict, so a line carrying a
  "note" is refused by name — "scope" is the text field, and it is required
  rather than optional.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"lines":[{"jobTypeId":"<uuid>","quantity":6,
               "scope":"France, Monday to Friday"}]}`;

/** Appended to `nexus role set-variables`. */
export const VARIABLES_BODY_SHAPE = `
  THE BODY IS { "variables": [ Variable, ... ] } and a Variable is:

${renderFields(VARIABLE_FIELDS)}

  ALL FIVE KEYS ARE REQUIRED AND THREE OF THEM TAKE null. The schema is strict,
  so an omitted key is a 400 naming it and an unknown key is refused by name —
  but "required" is about the KEY, never about the value: description, unit and
  value each accept null, and null is how you say "none". Only key and label
  must be non-empty text.

  The read-first example above hides that, because a Role that already HAS
  variables hands you complete elements to edit. The FIRST variable on a Role
  that has none is composed by hand.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"variables":[{"key":"wage","label":"Hourly wage","description":null,
                   "unit":"€ / h","value":23.5}]}`;

/**
 * Appended to `nexus role coverage`.
 *
 * The reason names ARE the actionable part of the not-modelled arm, and every
 * sibling enum on this server already enumerates itself — `basis` answers
 * *"expected one of "SALARY"|"HOURLY"|…"*. This one field did not, so a caller
 * met a bare `NO_WORKING_TIME_MODEL` with no way to learn what else could come.
 */
export const COVERAGE_REASON_VOCABULARY = `
  THREE ARMS CARRY A CLOSED "reason", THEY NARROW SEPARATELY, and these are all
  of them.
  coverage.reason is one of:
${wrapMembers(Object.keys(COVERAGE_NOT_MODELLED_REASONS), "    ", 68)}
  money.reason is one of:
${wrapMembers(Object.keys(COVERAGE_MONEY_NOT_MODELLED_REASONS), "    ", 68)}
  savingsProjection.reason is one of:
${wrapMembers(Object.keys(COVERAGE_SAVINGS_PROJECTION_UNAVAILABLE_REASONS), "    ", 68)}

  NO_WORKLOAD_MODEL means this Role has no workload row. NO_WORKING_TIME_MODEL
  means the ORGANIZATION has no automation settings row, and NO_CURRENCY means
  it states no currency — both are org-wide rather than per Role, so they answer
  the same for every Role until "nexus role set-automation-settings" is run.
  Every other reason names a stored model that did not evaluate; the matching
  integrity.warnings entry carries the detail.

  THE PROJECTION IS A THIRD FIGURE AND FAILS ON ITS OWN. savingsProjection is
  the saved hours priced at ONE blended rate — the Role's labour cost divided by
  its worked hours — so it needs a labour cost that neither of the arms above
  reads. It answers "unavailable" with a percentage sitting beside it whenever
  nobody has costed the Role, and neither coverage.reason nor money.reason says
  why. Read its own reason.

  Two of its arms are DELIBERATELY COARSE and the detail is elsewhere:
  NO_WORKLOAD_COST covers "never authored" and "authored and does not evaluate"
  alike, and NO_WORKLOAD_HOURS is every reason coverage has no denominator —
  coverage.reason already names which. IMPACT_HOURS_UNAVAILABLE is ROW-LEVEL
  ONLY: each contributions[] row carries its own savingsProjection over this
  same vocabulary, and the Role-level figure sums those rows, so it can never
  answer that one.`;

/**
 * Appended to `nexus role --help`.
 *
 * ⚠️ AN ENUMERATION OF VERBS IS READ AS AN ENUMERATION OF THE PLATFORM, and a
 * CEO audit of this namespace concluded the product could not do these things.
 * It can; they are served only to a logged-in dashboard session. Naming the gap
 * is what stops the next reader making the same inference — an absent verb and
 * an absent capability are indistinguishable from inside `--help`.
 *
 * Every line below is a route that exists on the internal API today. Do not add
 * a line for something that is genuinely absent from the product; the value of
 * this block is that everything in it is reachable somewhere.
 */
export const ROLE_NAMESPACE_GAPS = `
WHAT THIS NAMESPACE DOES NOT COVER, AND WHY THAT IS NOT THE PLATFORM'S LIMIT.
These have NO verb here at any version, and they are not missing features —
they exist in the product and are served only to a logged-in dashboard session:

  • boards and card placement  the Role's Overview lanes
  • the system map             every system the organization runs, and the
                               edges between them
  • a Role's workload          the person-hours coverage divides by
  • a system's impact model    the person-hours one system gives back
  • task graduation            turning a task into a system

The workload and the impact model are the two writes that move the coverage
figure, and their absence from the public API is a decision with a reason —
"nexus role coverage --help" carries it. Author all five on the Role's own
screens in the dashboard.`;

/**
 * Every `nexus role` verb, grouped by what it is FOR.
 *
 * Commander prints subcommands in ONE alphabetical block, so `coverage` — the
 * cost model — lands between `collection-grants` and `create`, which are the
 * Role's identity. Read in that order the namespace looks both larger and
 * flatter than it is, and the audit reported exactly that.
 *
 * 🚨 A SECOND LIST OF VERBS DRIFTS FROM THE FIRST AS SOON AS ONE IS ADDED, AND
 * `--help` CANNOT SAY SO — a new verb is simply absent from the index and the
 * page still renders, correct-looking and incomplete. That is the failure mode
 * of every hand-maintained index, so this one is not trusted:
 * `role-namespace-index.test.ts` reads the LIVE commander tree and refuses a
 * verb no area claims AND an area naming a verb that no longer exists. Adding a
 * verb reds that spec by name until an area takes it.
 *
 * The count in the rendered text is derived from this list for the same reason —
 * a number written by hand is the one part of an index nobody re-checks.
 */
export const ROLE_NAMESPACE_AREAS: ReadonlyArray<{
  readonly label: string;
  readonly verbs: readonly string[];
}> = [
  {
    label: "THE ROLE",
    verbs: [
      "list",
      "get",
      "create",
      "update",
      "delete",
      "pause",
      "resume",
      "responsibilities",
      "add-responsibility",
      "remove-responsibility"
    ]
  },
  {
    label: "PEOPLE",
    verbs: [
      "members",
      "add-member",
      "remove-member",
      "permission-sets",
      "create-permission-set",
      "update-permission-set",
      "delete-permission-set",
      "add-permission-set-member",
      "remove-permission-set-member"
    ]
  },
  {
    label: "WHAT IT REACHES",
    verbs: [
      "systems",
      "attach",
      "detach",
      "system-policy",
      "set-system-policy",
      "collection-grants",
      "grant-collection",
      "revoke-collection",
      "workspace-grants",
      "grant-workspace",
      "revoke-workspace"
    ]
  },
  {
    label: "THE OVERVIEW",
    verbs: ["boards", "add-board", "reorder-boards", "update-board", "remove-board", "move-card"]
  },
  {
    label: "REQUESTS",
    verbs: [
      "governance",
      "access-requests",
      "request-access",
      "review-access",
      "creation-requests",
      "creation-request",
      "review-creation-request",
      "deletion-requests",
      "deletion-request",
      "review-deletion-request"
    ]
  },
  {
    label: "THE COST MODEL",
    verbs: [
      "coverage",
      "automation-settings",
      "set-automation-settings",
      // FILED UNDER THE COST MODEL RATHER THAN BESIDE `set-system-policy`, even
      // though both write a fact about a system. What a reader is looking for
      // when they reach this index is what MOVES the figure, and this is the
      // only verb here besides `set-automation-settings` that does — the policy
      // write moves nothing.
      "set-system-lifecycle",
      "job-types",
      "create-job-type",
      "update-job-type",
      "delete-job-type",
      "scope-lines",
      "set-scope-lines",
      "variables",
      "set-variables",
      "working-year",
      "set-working-year",
      "tasks",
      "set-tasks",
      "task-duties",
      "set-task-duties"
    ]
  }
];

/** The column the verbs start in, so every area label lines up. */
const AREA_LABEL_WIDTH = 18;

function renderArea(label: string, verbs: readonly string[]): string {
  const indent = " ".repeat(2 + AREA_LABEL_WIDTH);
  const wrapped = wrapMembers(verbs, indent, 58);
  return `  ${label.padEnd(AREA_LABEL_WIDTH)}${wrapped.slice(indent.length)}`;
}

const ROLE_VERB_COUNT = ROLE_NAMESPACE_AREAS.reduce((total, area) => total + area.verbs.length, 0);

/** Appended to `nexus role --help`, above {@link ROLE_NAMESPACE_GAPS}. */
export const ROLE_NAMESPACE_INDEX = `
THAT LIST IS ALPHABETICAL, WHICH IS NOT AN ORDER ANYONE READS IT IN.
The ${ROLE_VERB_COUNT} verbs are ${ROLE_NAMESPACE_AREAS.length} areas:

${ROLE_NAMESPACE_AREAS.map((area) => renderArea(area.label, area.verbs)).join("\n\n")}

Only THE COST MODEL feeds "nexus role coverage", and inside it exactly TWO verbs
move the figure. "set-automation-settings" writes one of the three rows it is
derived from — "nexus role coverage --help" names all three and says where the
other two are authored. "set-system-lifecycle" moves it WITHOUT touching a row:
only a LIVE system is summed, so it decides which already-modelled systems count.`;
