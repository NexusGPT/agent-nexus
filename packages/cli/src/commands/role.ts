import type {
  RoleBoardAccent,
  RoleBoardCardType,
  AttachRoleSystemBody,
  CreateRoleBody,
  CreateRolePermissionSetBody,
  CreateRoleResult,
  DeleteRoleResult,
  NexusClient,
  RoleAutomationSettingsBody,
  RoleJobTypeBody,
  RolePermissionSetResourceReach,
  RoleReadinessEntry,
  RoleResourceType,
  RoleScopeLinesBody,
  RoleSystemPolicyBody,
  RoleTaskAssignmentInput,
  RoleTaskDutiesBody,
  RoleTasksBody,
  RoleVariablesBody,
  RoleWorkingYearBody,
  UpdateRoleBody,
  UpdateRolePermissionSetBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumArgument, enumInCompositeOption, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import {
  absent,
  isJsonMode,
  printList,
  printRecord,
  printSuccess,
  printWarning,
  type RecordField
} from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { parseIdList } from "../util/ids";
import {
  ROLE_ACCESS_REQUESTS_CREATE__BODY_RESOURCE_TYPE,
  ROLE_ACCESS_REQUESTS_CREATE_CONTRACT,
  ROLE_ACCESS_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_ACCESS_REQUESTS_REVIEW_CONTRACT,
  ROLE_CREATION_REQUESTS_LIST__PARAMS_STATUS,
  ROLE_CREATION_REQUESTS_LIST_CONTRACT,
  ROLE_CREATION_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_CREATION_REQUESTS_REVIEW_CONTRACT,
  ROLE_DELETION_REQUESTS_LIST__PARAMS_STATUS,
  ROLE_DELETION_REQUESTS_LIST_CONTRACT,
  ROLE_DELETION_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_DELETION_REQUESTS_REVIEW_CONTRACT,
  ROLE_JOB_TYPES_CREATE_CONTRACT,
  ROLE_JOB_TYPES_UPDATE_CONTRACT,
  ROLES_ATTACH_RESOURCE__BODY_RESOURCE_TYPE,
  ROLES_ATTACH_RESOURCE_CONTRACT,
  ROLES_CREATE_BOARD__BODY_ACCENT,
  ROLES_CREATE_BOARD_CONTRACT,
  ROLES_DELETE_BOARD_CONTRACT,
  ROLES_LIST_BOARDS_CONTRACT,
  ROLES_MOVE_BOARD_CARD__PATH_VARS_CARD_TYPE,
  ROLES_MOVE_BOARD_CARD_CONTRACT,
  ROLES_REORDER_BOARDS_CONTRACT,
  ROLES_UPDATE_BOARD__BODY_ACCENT,
  ROLES_UPDATE_BOARD_CONTRACT,
  ROLES_CREATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
  ROLES_CREATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
  ROLES_CREATE_PERMISSION_SET_CONTRACT,
  ROLES_DETACH_RESOURCE__PATH_VARS_RESOURCE_TYPE,
  ROLES_DETACH_RESOURCE_CONTRACT,
  ROLES_LIST_ACCESS_REQUESTS__PARAMS_STATUS,
  ROLES_LIST_ACCESS_REQUESTS_CONTRACT,
  ROLES_UPDATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
  ROLES_UPDATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
  ROLES_UPDATE_PERMISSION_SET_CONTRACT,
  ROLES_UPSERT_MEMBER__BODY_TIER,
  ROLES_UPSERT_MEMBER_CONTRACT
} from "./role.contract.generated";
import {
  COVERAGE_REASON_VOCABULARY,
  JOB_TYPE_BODY_SHAPE,
  ROLE_NAMESPACE_GAPS,
  ROLE_NAMESPACE_INDEX,
  SCOPE_LINES_BODY_SHAPE,
  VARIABLES_BODY_SHAPE
} from "./role-body-shapes";
import {
  COVERAGE_INPUTS_NOTE,
  JOB_MODEL_DOES_NOT_MOVE_COVERAGE,
  NOT_STATED,
  WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK
} from "./role-coverage-copy";

/**
 * `nexus role` — the Roles surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE HELP TEXT USES THE SCREEN'S WORDS, THE CODE USES THE CODE'S
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An external operator types these commands having read the dashboard, not the
 * schema. Three names differ, and inventing a third word for any of them is worse
 * than either:
 *
 * | in this CLI | on screen | in the database |
 * |---|---|---|
 * | `systems` | a system the Role holds | `RoleResource` |
 * | `permission-sets` | a permission set | `RoleGroup` |
 * | — not exposed — | the "Group access" tab | `RoleGroupGrant` |
 *
 * `RoleGroup` and `RoleGroupGrant` are one character apart and mean opposite
 * things, which is why `permission-sets` is never spelled `groups` here even
 * though the internal HTTP route is.
 *
 * ── EVERY `<role>` TAKES A NAME OR A UUID ────────────────────────────────────
 *
 * A uuid goes straight through. Anything else is resolved by listing the
 * organization's Roles and matching on name — see {@link resolveRoleId}. That
 * turns "attach this system to the Support Role" from three commands into one,
 * and it is affordable only because the Roles list is unpaginated by design: a
 * Role is a unit of organizational structure, so the list is bounded by how the
 * company is arranged rather than by usage.
 */

/** A Role id is `@db.Uuid`, so a uuid-shaped argument is never a name. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A coverage money figure, with the floating-point residue taken off.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `String(amount)` PRINTS `16250.000000000002`, AND THAT NUMBER IS CORRECT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `savingsProjection.amount` is `impactPersonHours × ratePerHour`, and
 * `ratePerHour` is `workloadCost ÷ workloadPersonHours` — so the headline is a
 * division multiplied back by its own divisor. In IEEE-754 that is not an
 * identity: `(260000 / 7360) * 7360` is `16250.000000000002`. The engine is
 * right, the payload is right, and `--json` must keep every digit — a caller
 * reconciling the rate against the amount needs the number that was used.
 *
 * What is wrong is printing those digits in a HUMAN table. `printRecord`'s
 * `format` is the human channel and leaves the JSON document untouched
 * (`output.ts` states that split), and every other figure in this record is
 * already formatted for it — the ratio two fields up is `(ratio * 100).toFixed(2)`.
 * `String()` on the money was the one field that was not, so a reader saw twelve
 * digits of residue on the one number a demo puts on screen and had no way to
 * tell it from a broken model.
 *
 * Two decimals, not zero: these are currency amounts and a blended rate is two
 * significant figures wide — `35.33/h` rounded to whole units is `35`, a 1%
 * error printed directly beside the total it produced. The dashboard makes the
 * same split for the same reason (`formatFigures.ts`: `formatMoney` pins 0,
 * `formatRate` pins 2); a CLI table has one column and no room for two rules, so
 * it takes the finer of the two.
 *
 * `Number(...)` around the `toFixed` is what drops a trailing `.00`, so a whole
 * amount still reads `16250` rather than `16250.00`. Deliberately NOT `Intl`:
 * this string is read in a terminal on an unknown locale, and grouping
 * separators that move with `LANG` are a worse cost here than they are in a
 * browser that already knows the reader's language.
 */
function coverageMoney(amount: number): string {
  return String(Number(amount.toFixed(2)));
}

/**
 * Every member of `RoleResourceType`, as a runtime lookup.
 *
 * A `Record` over the union rather than an array, for the reason the permissions
 * command gives: a kind added to the SDK is a COMPILE ERROR here until it is
 * listed, where an array would silently start rejecting a kind the server accepts.
 *
 * ⚠️ NOT the same set as the permission system's resource types. A Role holds
 * OPERATIONAL systems; a sharing grant is written against a different set, and
 * `knowledge` / `credential` / `workspace` appear only in the second. Passing one
 * of those here is refused locally rather than 400ing on a path segment.
 *
 * 🔴 `external_tool` LEFT THIS SET ON 2026-08-13 AND MUST NOT BE PUT BACK. A
 * Role reaches a tool through `RoleExternalToolGrant`, an M:N table, because
 * several Roles legitimately hold the same catalogue tool — which
 * `RoleResource @@unique([organizationId, resourceType, resourceId])` cannot
 * express. `attach`/`detach` write `RoleResource`, so offering `external_tool`
 * here sends an operator down a path the server refuses. The compile error that
 * removing it from the SDK produced HERE is this comment's whole point working
 * as designed: it fires in the removal direction too, not only on an addition.
 */
const ROLE_RESOURCE_TYPES: Record<RoleResourceType, true> = {
  agent: true,
  workflow: true,
  deployment: true,
  ai_task: true,
  document_template: true
};

const RESOURCE_TYPE_NAMES = Object.keys(ROLE_RESOURCE_TYPES).sort().join(", ");

/**
 * The two arms a task assignment may take, as a Record over the SDK's own union.
 *
 * 🚨 THE `Record<…, true>` IS THE GATE, EXACTLY AS IT IS FOR THE RESOURCE TYPES
 * ABOVE. An arm added to the SDK is a compile error until it is listed here; an
 * arm removed is a `TS2353` on this object. That is the only thing binding the
 * `--help` below to the shape the API actually accepts — and the help documented
 * a `"person:<userId>"` string form that the API has never taken, for as long as
 * nothing read both (NEX-3778).
 */
const ROLE_TASK_ASSIGNMENT_KINDS: Record<RoleTaskAssignmentInput["kind"], true> = {
  person: true,
  resource: true
};

/**
 * Exported so `role.test.ts` can assert the `--help` INTERPOLATED these rather
 * than restating them. A test spelling the arms out itself would be a third copy
 * beside the schema and the help, which is the shape that produced NEX-3778.
 */
export const ASSIGNMENT_KIND_NAMES = Object.keys(ROLE_TASK_ASSIGNMENT_KINDS).sort().join(" and ");

export { RESOURCE_TYPE_NAMES };

function isRoleResourceType(value: string): value is RoleResourceType {
  return Object.prototype.hasOwnProperty.call(ROLE_RESOURCE_TYPES, value);
}

/**
 * Turn a `<role>` argument into a Role id.
 *
 * A uuid is returned untouched — no lookup, no extra request. A name costs one
 * `GET /roles`, which is unpaginated.
 *
 * ── WHY THE MATCH IS TWO PASSES AND WHY IT REFUSES ───────────────────────────
 *
 * An exact case-insensitive name wins outright. Only when nothing matches exactly
 * does it fall back to a substring, and BOTH passes refuse on more than one
 * candidate rather than picking. That refusal is the whole point: several of these
 * commands write, and `attach` MOVES a system off whichever Role held it — so a
 * silently wrong Role here takes a customer's production system away from the
 * team that owns it. Ambiguity names its candidates and stops.
 *
 * ⚠️ THIS NEEDS `roles:read`. A key holding only `role_coverage:read` can reach
 * `nexus role coverage <uuid>` and cannot resolve a NAME at all, because the list
 * it would resolve against is behind a scope it does not hold. The error says so
 * instead of reporting the Role as missing.
 */
async function resolveRoleId(client: NexusClient, ref: string): Promise<string> {
  if (UUID_PATTERN.test(ref)) return ref;

  let roles: { id: string; name: string }[];
  try {
    ({ roles } = await client.roles.list());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot resolve the Role name "${ref}": listing Roles failed (${detail}). ` +
        `Resolving a name needs the roles:read scope — pass the Role's UUID instead if this key does not hold it.`
    );
  }

  const needle = ref.toLowerCase();
  const exact = roles.filter((role) => role.name.toLowerCase() === needle);
  const candidates =
    exact.length > 0 ? exact : roles.filter((r) => r.name.toLowerCase().includes(needle));

  // Ambiguity is decided FIRST so the single-match case can be narrowed by
  // destructuring rather than asserted. `candidates.length === 1` tells tsc
  // nothing about element 0, so indexing it needs a non-null assertion — which
  // this package's lint budget correctly refuses.
  if (candidates.length > 1) {
    const named = candidates.map((role) => `${role.name} (${role.id})`).join(", ");
    throw new Error(
      `"${ref}" matches ${String(candidates.length)} Roles: ${named}. Pass the UUID you mean.`
    );
  }

  const [only] = candidates;
  if (only !== undefined) return only.id;

  const available = roles
    .map((role) => role.name)
    .sort()
    .join(", ");
  throw new Error(
    `No Role named "${ref}" in this organization.` +
      (available.length > 0 ? ` Roles here: ${available}.` : " This organization has no Roles.")
  );
}

/**
 * This organization's Roles as `id -> name`, or an EMPTY map.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 BEST-EFFORT ON PURPOSE: A NAME LOOKUP MAY NEVER SUPPRESS A WARNING.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Its only callers are the two warning lines this CLI's own `--help` nominates as
 * the whole signal that another team just lost something. Listing Roles needs
 * `roles:read`, which a write-scoped key need not hold — {@link resolveRoleId}
 * carries the same caveat — so this lookup can 403 on a call that otherwise
 * succeeded. Throwing here would replace the warning with an error about the
 * cosmetics of the warning, on the one line that must always print.
 *
 * So a failure degrades to an empty map and {@link describeRole} falls back to the
 * bare UUID, which is exactly what shipped before. A name IMPROVES the sentence; it
 * is never a precondition for printing it.
 */
async function roleNamesById(client: NexusClient): Promise<Map<string, string>> {
  try {
    const { roles } = await client.roles.list();
    return new Map(roles.map((entry) => [entry.id, entry.name]));
  } catch {
    return new Map();
  }
}

/**
 * Identify a Role to a READER: `Name (uuid)`, or the bare UUID when unresolved.
 *
 * BOTH HALVES ARE LOAD-BEARING, and this is the spelling {@link resolveRoleId}
 * already uses when it refuses an ambiguous name. The NAME is the half a human
 * recognises — a UUID names no team to anybody, and these sentences exist to tell
 * a reader WHICH team was affected. The UUID stays because a name is not a key
 * here: `resolveRoleId` REFUSES a name matching more than one Role, so a warning
 * that prescribes "attach the system back to that Role" would otherwise hand the
 * reader a string the remedy can reject.
 *
 * ⚠️ THIS IS STDERR PROSE AND NOTHING ELSE. `printWarning` writes to stderr and is
 * excluded from the `--json` document by construction (see `output.ts`), so no
 * script parses it. The machine-readable answer is the `movedFrom` field of the
 * `printSuccess` payload, which stays a bare UUID because seizure detection is
 * built on it — do NOT "improve" that field to match this one.
 */
function describeRole(names: Map<string, string>, roleId: string): string {
  const name = names.get(roleId);
  return name === undefined ? roleId : `${name} (${roleId})`;
}

/**
 * Say out loud when a permission set list is not yet the Role's answer.
 *
 * `[]` from the server means one of two completely different things and the bytes
 * are identical: nothing has been seeded yet, or the Role genuinely has no sets.
 * Only `readiness` tells them apart, and only `roles get` / `roles list` carry it
 * — so a caller reading `permission-sets` alone cannot know. Printing the warning
 * where the empty list is rendered is what stops an operator "fixing" it by hand
 * and getting duplicates when the reconciler runs.
 */
function warnIfPermissionSetsMayBePending(count: number): void {
  if (count > 0) return;
  printWarning(
    "This Role reports no permission sets.",
    "An empty list can mean the system sets have not been seeded YET — they are written by a",
    "background reconciler, not at Role creation. Run `nexus role get <role>` and read",
    "readiness.permissionSets: PENDING means retry, READY means this list is the answer.",
    "Do NOT create sets by hand to fill the gap; the reconciler writes them anyway."
  );
}

/**
 * Parse a `--flag <value|none>` into `number | null`.
 *
 * 🚨 THE WHOLE JOB MODEL IS REQUIRED-AND-NULLABLE, and `null` is not `0`. `null`
 * means "no override / unset"; `0` asserts a measured zero. Both are accepted by
 * the server and they produce different money, so nothing downstream will tell an
 * operator which they meant. `none` is the token this CLI invents for `null`,
 * because an omitted flag cannot express it on a PUT that requires the field.
 */
function readNullableNumber(raw: string, flag: string): number | null {
  if (raw === "none" || raw === "null") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number, or "none" to unset it. Got "${raw}".`);
  }
  return value;
}

/** Parse a required positive number — these three have no null form. */
function readPositiveNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a finite number greater than 0. Got "${raw}".`);
  }
  return value;
}

/**
 * Case-fold a flag value before it is checked against a contract enum.
 *
 * The wire values are upper-case and nobody types them that way, so folding is
 * what keeps `--status pending` working. It is passed to `enumOption` as its
 * NORMALISER rather than applied in the action: normalising first and validating
 * the OUTPUT asserts that the thing which actually goes on the wire is an enum
 * member, whatever the operator typed.
 */
function foldUpper(raw: string): string {
  return raw.toUpperCase();
}

/** Parse `--flag true|false`. A typo must not read as `false`. */
function readBoolean(raw: string, flag: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${flag} must be "true" or "false". Got "${raw}".`);
}

/** `--currency EUR` or `--currency none`, which clears it. */
function readNullableString(raw: string): string | null {
  return raw === "none" || raw === "null" ? null : raw;
}

/** APPROVED / REJECTED, case-folded. `PENDING` is a start state, never a verdict. */
function readVerdict(raw: string): "APPROVED" | "REJECTED" {
  const upper = raw.toUpperCase();
  if (upper === "APPROVED" || upper === "REJECTED") return upper;
  throw new Error(`Invalid verdict "${raw}". Expected APPROVED or REJECTED.`);
}

/**
 * One required field of a whole-object PUT: the body key, and the flag a user
 * actually types to supply it.
 *
 * 🚨 THE PAIR IS EXPLICIT BECAUSE DERIVING THE FLAG NAME WAS WRONG. Kebab-casing
 * the body key produces `--working-weeks-per-year`, `--paid-leave-weeks`,
 * `--public-holiday-days` and `--sickness-days` — four flags that do not exist.
 * The real options are shorter than their body keys, so the refusal named
 * something the caller could not pass, and they edited the wrong thing and
 * retried. That is worse than a bare "missing field", because the error looked
 * actionable.
 *
 * A derivation cannot be made correct here: commander's option names are a
 * product decision and the body keys are the server's, so the two are related by
 * nothing a function can compute. Stating both is the only form that cannot
 * drift, and a wrong pair is now visible at the call site instead of hidden in a
 * regex.
 */
interface RequiredField {
  /** The key the request body must carry. */
  readonly field: string;
  /** The flag exactly as a user types it, WITHOUT the leading `--`. */
  readonly flag: string;
}

/**
 * Refuse a PUT that is missing a required field, BEFORE it reaches the wire.
 *
 * These routes replace a whole object, so an omitted field is a 400 rather than
 * "leave it alone". Naming every missing flag at once beats one 400 per attempt —
 * which only holds while the names are the ones the user can actually type.
 */
function requireAll(
  provided: Record<string, unknown>,
  required: readonly RequiredField[],
  hint: string
): void {
  const missing = required.filter(({ field }) => provided[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required ${missing.length === 1 ? "flag" : "flags"}: ${missing
        .map(({ flag }) => `--${flag}`)
        .join(", ")}. ${hint}`
    );
  }
}

/**
 * Say so when a permission set reaches NOTHING.
 *
 * `no_surface` means a relation is set with an empty surface allow-list, so the
 * set grants no resource access at all while looking configured. The server
 * refuses that pair on a write, so this is a belt-and-braces read of what came
 * back — and it is cheap insurance against the day the refusal is relaxed.
 *
 * `capability_only` is NOT warned about: reaching no resources is the whole point
 * of a capability-only set, and warning on a chosen state trains the reader to
 * ignore the warning that matters.
 */
function warnIfReachesNothing(reach: RolePermissionSetResourceReach): void {
  if (reach !== "no_surface") return;
  printWarning(
    "This permission set reaches NOTHING.",
    "It has a resource relation but an empty surfaces allow-list, and surfaces is a strict",
    'allow-list rather than a filter. Pass --surfaces "*" for every surface, name the',
    "surfaces you mean, or --relation none for a capability-only set."
  );
}

/** Render `permissionSets=PENDING, owner=READY`, or a dash when there is nothing. */
function formatReadiness(value: unknown): string {
  if (value === null || typeof value !== "object") return "—";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "roleId")
    .map(([key, state]) => `${key}=${String(state)}`);
  return entries.length > 0 ? entries.join(", ") : "—";
}

/**
 * Report an unset row instead of crashing on it.
 *
 * 🚨 THREE READS ANSWER `null` WHEN NOTHING HAS BEEN AUTHORED — automation
 * settings, the working year and the system policy. `printRecord` reads fields off
 * its argument, so `null` throws `Cannot read properties of null`, and the
 * alternative of rendering blanks or `false` would report a configuration nobody
 * chose. "Nothing is stated" is the answer, and it is a SUCCESS: exit code 0, and
 * under `--json` a literal `null` so a script can branch on it.
 */
function printStatedOrNothing<T extends object>(
  value: T | null,
  what: string,
  fields: readonly RecordField<T>[]
): boolean {
  if (value !== null) {
    printRecord(value, fields);
    return true;
  }
  if (isJsonMode()) {
    console.log(JSON.stringify(null, null, 2));
  } else {
    console.log(`${what} is not configured — nothing has been stated for it.`);
  }
  return false;
}

export function registerRoleCommands(program: Command): void {
  const role = program
    .command("role")
    .description("Read and manage Roles — who holds which systems, and what each Role reaches");

  role.addHelpText(
    "after",
    `
Every <role> argument takes a Role NAME or a UUID. A name costs one extra
lookup and needs the roles:read scope.

Two facts that decide whether a write does damage:
  • "role attach" MOVES a system. Each system belongs to exactly ONE Role, so
    attaching takes it off whatever Role held it, along with the access that
    Role's members had. The command prints which Role it came from.
  • A system in NO Role reaches nothing at runtime and reports no error. So
    "role detach", and deleting a Role, are quiet disablings — not tidy-ups.
${ROLE_NAMESPACE_INDEX}
${ROLE_NAMESPACE_GAPS}`
  );

  // ── list ──────────────────────────────────────────────────────────────────
  role
    .command("list")
    .description("List every Role in the organization")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role list
  $ nexus role list --json

Notes:
  Unpaginated — a Role is a unit of organizational structure, so this list is
  bounded by how the company is arranged rather than by usage.
  READINESS says whether each Role's permission sets have been seeded yet.

  --json HERE IS NOT THE API'S SHAPE, AND BOTH SPELL IT "data". This command
  JOINS readiness onto each row, so "data" is an ARRAY of Roles each carrying a
  "readiness" object — null for a Role the server reported none for. The API,
  GET /public/v1/roles, answers "data" as an OBJECT of two parallel arrays,
  {"roles": [...], "readiness": [...]}, to be correlated on roleId. A parser
  written against one raises a type error on the other: dict in one, list in
  the other. Run "nexus api GET /roles" to get the API shape verbatim.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { roles, readiness } = await client.roles.list();
        const byRole = new Map<string, RoleReadinessEntry>(readiness.map((r) => [r.roleId, r]));

        printList(
          roles.map((r) => ({ ...r, readiness: byRole.get(r.id) ?? null })),
          undefined,
          [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 28 },
            { key: "ownerUserId", label: "OWNER", width: 32 },
            // 🚨 NO `width`, DELIBERATELY. `printTable` HARD-TRUNCATES an explicit
            // width (`.padEnd(w).slice(0, w)`), and the longest rendering here —
            // `permissionSets=PENDING, owner=ABSENT` — is 36 characters. At the 34
            // this used to carry, `ABSENT` and `READY` were both clipped, which
            // destroys the one distinction readiness exists to make: a clipped
            // `READ`/`ABSEN` reads as noise, and a reader takes it for "fine".
            // Omitting `width` makes the column size itself from the data, so it
            // cannot be wrong again when a state name changes length.
            { key: "readiness", label: "READINESS", format: formatReadiness }
          ]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────────
  role
    .command("get")
    .description("Show one Role, without the systems it holds")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role get "Support agent"
  $ nexus role get 11111111-1111-4111-8111-111111111111

Notes:
  The systems are a separate read (nexus role systems) under a separate scope,
  so listing Roles does not also hand over the inventory each one owns.
  readiness.permissionSets PENDING means retry; owner ABSENT is final.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: found, readiness } = await client.roles.get(await resolveRoleId(client, ref));

        printRecord({ ...found, readiness }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "jobDescription", label: "Job description" },
          { key: "ownerUserId", label: "Owner" },
          { key: "readiness", label: "Readiness", format: formatReadiness },
          // A `get` that hid the stop would be the worst place to hide it: this
          // is the command an operator runs to find out why a Role's workflows
          // are not firing. `pausedAt` null means running.
          { key: "pausedAt", label: "Paused at" },
          { key: "pausedByUserId", label: "Paused by" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── systems ───────────────────────────────────────────────────────────────
  role
    .command("systems")
    .description(
      "List the systems a Role holds — agents, workflows, deployments, AI tasks, templates"
    )
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role systems "Support agent"

Notes:
  Each system belongs to exactly ONE Role. An empty list is not a tidy state:
  a system in no Role reaches nothing at runtime and reports no error.
  Needs role_resources:read, which is separate from roles:read on purpose.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { resources } = await client.roles.listSystems(await resolveRoleId(client, ref));

        printList(resources, undefined, [
          { key: "resourceType", label: "TYPE", width: 20 },
          { key: "resourceId", label: "ID", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── members ───────────────────────────────────────────────────────────────
  role
    .command("members")
    .description("List a Role's owner, admins and plain members")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role members "Support agent"

Notes:
  The OWNER is a field on the Role, never a membership row — so they do not
  appear under admins. Read the Owner line, and use "nexus role update" to
  hand a Role over.
  The terminal rendering is TWO blocks — a summary, then one table of admins and
  members with a TIER column. Under --json it is the untouched response,
  {roleId, ownerUserId, admins, members}, with the two tiers as separate arrays.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const membership = await client.roles.listMembers(await resolveRoleId(client, ref));

        // `--json` gets the WHOLE response, once. The two blocks below are a
        // human rendering of the same object, and every printer in `output.ts`
        // short-circuits to its own `console.log(JSON.stringify(...))` under
        // `--json` — so calling two of them emitted `{...}{"data":[...]}`, which
        // `JSON.parse` rejects outright and `jq` reads as a stream. A script got
        // either a crash or, worse, only the first document: the counts without
        // a single member in them (NEX-2176). Same shape and same fix as
        // `skill-folder list`.
        if (isJsonMode()) {
          console.log(JSON.stringify(membership, null, 2));
          return;
        }

        printRecord(membership, [
          { key: "roleId", label: "Role" },
          { key: "ownerUserId", label: "Owner" },
          { key: "admins", label: "Admins", format: () => String(membership.admins.length) },
          { key: "members", label: "Members", format: () => String(membership.members.length) }
        ]);
        printList([...membership.admins, ...membership.members], undefined, [
          { key: "userId", label: "USER", width: 34 },
          { key: "tier", label: "TIER", width: 8 },
          { key: "addedByUserId", label: "ADDED BY", width: 34 },
          { key: "createdAt", label: "SINCE", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── permission-sets ───────────────────────────────────────────────────────
  role
    .command("permission-sets")
    .description("List a Role's permission sets — its named capability bundles")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role permission-sets "Support agent"

Notes:
  NOT the "Group access" tab, which is a different thing entirely (a user group
  reaching one surface of the Role) and is not on this API.
  SURFACES is a strict allow-list: an empty list reaches NOTHING, and "*"
  reaches everything. Never read empty as unrestricted.
  RELATION is blank for a capability-only set — that is a chosen state.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { permissionSets } = await client.roles.listPermissionSets(
          await resolveRoleId(client, ref)
        );

        printList(permissionSets, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 22 },
          { key: "isSystem", label: "SYSTEM", width: 7 },
          { key: "resourceRelation", label: "RELATION", width: 9 },
          {
            key: "surfaces",
            label: "SURFACES",
            width: 26,
            format: (val) => (Array.isArray(val) && val.length > 0 ? val.join(",") : "(none)")
          },
          {
            key: "capabilities",
            label: "CAPS",
            width: 5,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          },
          { key: "memberCount", label: "MEMBERS", width: 8 }
        ]);
        warnIfPermissionSetsMayBePending(permissionSets.length);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── collection-grants ─────────────────────────────────────────────────────
  role
    .command("collection-grants")
    .description("List the knowledge collections a Role reaches")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role collection-grants "Support agent"

Notes:
  A grant, not a system: a collection can be shared across several Roles. That
  is one of the two exceptions to a Role's exclusive ownership.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grants } = await client.roles.listCollectionGrants(
          await resolveRoleId(client, ref)
        );

        printList(grants, undefined, [
          { key: "id", label: "GRANT ID", width: 36 },
          { key: "collectionId", label: "COLLECTION", width: 36 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── workspace-grants ──────────────────────────────────────────────────────
  role
    .command("workspace-grants")
    .description("List the file workspaces a Role reaches")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role workspace-grants "Support agent"

Notes:
  The same many-to-many exception as a collection grant — a workspace can be
  shared across several Roles.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grants } = await client.roles.listWorkspaceGrants(await resolveRoleId(client, ref));

        printList(grants, undefined, [
          { key: "id", label: "GRANT ID", width: 36 },
          { key: "workspaceId", label: "WORKSPACE", width: 36 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── access-requests ───────────────────────────────────────────────────────
  const accessRequests = role
    .command("access-requests")
    .description("List requests for access to one of a Role's systems")
    .argument("<role>", "Role name or UUID")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLES_LIST_ACCESS_REQUESTS__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role access-requests "Support agent" --status PENDING

Notes:
  THIS TABLE ACCUMULATES and the route has no pagination — a reviewed request
  is kept with its verdict rather than deleted, so the unfiltered read grows
  for the lifetime of the Role. Poll with --status PENDING, which is bounded by
  how fast the organization reviews.
  Seeing the queue and deciding an item are separate permissions; this API
  ships only the seeing.`
    )
    .action(async (ref: string, opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const status = readAccessRequestStatus(opts.status);
        const { requests } = await client.roles.listAccessRequests(
          await resolveRoleId(client, ref),
          { status }
        );

        printList(requests, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "resourceType", label: "TYPE", width: 18 },
          { key: "resourceId", label: "SYSTEM", width: 36 },
          { key: "requestedByUserId", label: "BY", width: 32 },
          { key: "createdAt", label: "ASKED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── coverage ──────────────────────────────────────────────────────────────
  role
    .command("coverage")
    .description("Show a Role's automation coverage, its assumptions and its money figures")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role coverage "Support agent"
  $ nexus role coverage "Support agent" --json

Notes:
  THIS RESPONSE CARRIES LABOUR COST. money.totals.workloadCost is the Role's
  annual salary-and-seat cost, and savingsProjection.ratePerHour is a blended
  pay rate. Holding role_coverage:read is NECESSARY AND NOT SUFFICIENT — the
  server also checks the key OWNER's coverage.view permission on this Role, so
  a valid key can still get a 403.

  "not modelled" is NOT 0% and NOT 100%. An empty contributions list beside a
  populated unmodelledSystems list means nobody has modelled anything.
${COVERAGE_REASON_VOCABULARY}
${COVERAGE_INPUTS_NOTE}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.getCoverage(await resolveRoleId(client, ref));

        printRecord(view, [
          { key: "roleId", label: "Role" },
          {
            key: "coverage",
            label: "Coverage",
            // A percentage is printed ONLY from the `modelled` arm. Rendering the
            // other arm as 0% is the single failure this whole union prevents.
            format: () =>
              view.coverage.kind === "modelled"
                ? `${(view.coverage.ratio * 100).toFixed(2)}%`
                : `not modelled (${view.coverage.reason})`
          },
          {
            key: "workloadPersonHours",
            label: "Worked h/yr",
            format: () => view.workloadPersonHours?.toString() ?? "not modelled"
          },
          { key: "impactPersonHours", label: "Automated h/yr" },
          {
            key: "contributions",
            label: "Modelled systems",
            format: () => String(view.contributions.length)
          },
          {
            key: "unmodelledSystems",
            label: "Unmodelled systems",
            format: () => String(view.unmodelledSystems.length)
          },
          {
            key: "savingsProjection",
            label: "Projected saving",
            format: () =>
              view.savingsProjection.kind === "projected"
                ? `${coverageMoney(view.savingsProjection.amount)} ${view.savingsProjection.currency}` +
                  ` (at ${coverageMoney(view.savingsProjection.ratePerHour)}/h)`
                : `unavailable (${view.savingsProjection.reason})`
          },
          {
            key: "money",
            label: "Money",
            format: () =>
              view.money.kind === "modelled"
                ? `${view.money.currency} · revenue ${coverageMoney(view.money.totals.revenue)}` +
                  ` · cost ${coverageMoney(view.money.totals.cost)}` +
                  ` · workload cost ${
                    view.money.totals.workloadCost === null
                      ? "not modelled"
                      : coverageMoney(view.money.totals.workloadCost)
                  }`
                : `not modelled (${view.money.reason})`
          },
          {
            key: "integrity",
            label: "Integrity",
            format: () =>
              `${view.integrity.status} (${String(view.integrity.warnings.length)} warnings)`
          }
        ]);

        if (view.integrity.status === "DEGRADED") {
          printWarning(
            "This coverage figure is DEGRADED — at least one model did not evaluate.",
            ...view.integrity.warnings.map((w) => `${w.severity}: ${w.code} — ${w.message}`)
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── job-types ─────────────────────────────────────────────────────────────
  role
    .command("job-types")
    .description("List the organization's job-type library — every way of paying for work")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role job-types

Notes:
  ORG-WIDE, not per Role. This read is how you learn the job-type ids a scope
  line has to name.
  UNREADABLE is not decoration: a row whose stored rate inputs did not parse is
  withheld from the list and its id reported instead — because listing it with
  no rates would price every scope line using it at ZERO with nothing saying so.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const library = await client.roles.listJobTypes();

        printList(library.jobTypes, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 26 },
          { key: "basis", label: "BASIS", width: 8 },
          { key: "group", label: "GROUP", width: 9 },
          { key: "quantityUnit", label: "UNIT", width: 12 },
          {
            key: "parts",
            label: "PARTS",
            width: 6,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          }
        ]);

        if (library.unreadable.length > 0) {
          printWarning(
            `${String(library.unreadable.length)} job type(s) could not be read and are NOT in the list above.`,
            `Ids: ${library.unreadable.join(", ")}`,
            "Their stored rate inputs did not parse. Any scope line naming one of these is",
            "priced from a model nothing can read — fix the row rather than ignoring this."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────────
  role
    .command("create")
    .description("Create a Role, or file a request to create one")
    // 🚨 NOT `requiredOption`, AND THAT IS NEX-3629. Commander enforces a
    // required option BEFORE the action runs, so it cannot see `--body` — a
    // complete body carrying name and ownerUserId was refused with
    // "required option '--name <name>' not specified", which defeats the one
    // thing `--body` is for. `name` and `jobDescription` are the two fields most
    // likely to carry an apostrophe or an accent, which is what breaks shell
    // quoting and sends a caller to a file in the first place.
    //
    // The requirement is unchanged; it is now checked AFTER both sources are
    // merged, by `requireAll`, which names the flags a user can actually type.
    .option("--name <name>", "The Role's display name — required, as a flag or in --body")
    .option("--owner <userId>", "Who owns it — required, the server will not choose")
    .option("--job-description <text>", "What the Role is for")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create --name "Refunds" --owner user_abc
  $ nexus role create --name "Refunds" --owner user_abc --job-description "Handles refunds"
  $ nexus role create --body ./role.json
  $ echo '{"name":"Réclamations","ownerUserId":"user_abc"}' | nexus role create --body -

Notes:
  --owner is REQUIRED here and optional in the dashboard. A key's subject is
  whoever MINTED the key, so defaulting the owner would make ownership a fact
  about a credential rather than a decision the organization took.

  A COMPLETE --body IS ENOUGH. name and ownerUserId may come from the body
  instead of from --name / --owner; a flag wins over the body field of the same
  name. The body keys are the API's — "ownerUserId", not "owner" — and
  jobDescription is optional in both places. Use --body when a value carries an
  apostrophe or an accent, which is what --body exists for.

  A 2xx DOES NOT MEAN A ROLE EXISTS. If governance requires approval this files
  a request instead and reports status "pending" — nothing was created and an
  admin must approve it. This command prints which of the two happened.

  BRANCH ON "status", NEVER ON THE EXIT CODE OR ON "success". Both outcomes are
  a 0 exit and "success": true. --json carries "status": "created" with the new
  Role's "id", or "status": "pending" with a "requestId" — poll that one with
  "nexus role creation-request <requestId>", whose CREATED ROLE holds the id
  once an admin approves it.

  A USER ID COMES FROM "nexus api GET /me", AND FROM NOWHERE ELSE IN THIS CLI.
  Nothing here lists the users in your organization, and "nexus auth whoami"
  prints the EMAIL under "user" and never the id — so pasting what whoami shows
  gets a 404 that reads as the user not existing. Your own id is
  "nexus api GET /me | jq -r .data.userId", and it is the same id
  "nexus role add-member", "nexus user-group add-member" and
  "nexus permissions grant --subject-type user" want.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          ownerUserId: opts.owner,
          jobDescription: opts.jobDescription
        });
        requireAll(
          body,
          [
            { field: "name", flag: "name" },
            // The body key is `ownerUserId`; the option is `--owner`.
            { field: "ownerUserId", flag: "owner" }
          ],
          "Pass each as a flag, or as a field of --body — the body keys are name and ownerUserId."
        );
        const result = await client.roles.create(asRequestBody<CreateRoleBody>(body));

        reportGovernedWrite(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────────
  role
    .command("update")
    .description("Rename a Role, rewrite its job description, or hand it to a new owner")
    .argument("<role>", "Role name or UUID")
    .option("--name <name>", "New display name")
    .option("--job-description <text>", "New job description")
    .option("--owner <userId>", "New owner, or 'none' to leave the Role unowned")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update "Refunds" --name "Refunds and disputes"
  $ nexus role update "Refunds" --owner user_xyz

Notes:
  HANDING A ROLE OVER REMOVES THE OUTGOING OWNER FROM IT ENTIRELY. An owner
  holds no membership row, so the moment --owner names somebody else the
  previous owner is in the Role in no form and their permission-set rows go
  with them. Nothing in the response says so.

  --owner none CLEARS ownership. An unowned Role has nobody who may transfer
  it, so only an org admin can ever give it an owner again.

  A transfer is checked separately against the CURRENT owner: refused, it is a
  403 and NOTHING ELSE in the request is applied.

  AN UNKNOWN FIELD IN --body IS DROPPED, NOT REFUSED. This body schema is not
  strict, so a key it does not know is stripped before the write and the call
  still answers success with that field unchanged — a typo looks like it worked.
  Only name, jobDescription and ownerUserId exist here. The Role's currency, its
  data-retention window, its paused state and its access card are NOT settable
  through this command and sending them changes nothing.

  A BODY CARRYING ONLY UNKNOWN KEYS ANSWERS "An update must change at least one
  field", because after they are dropped there is nothing left. That 400 is the
  one signal a field name was wrong — so it is worth sending a suspect key ALONE
  once, rather than beside a real one that would mask it.
  At least one field is required — an empty update is a 400 for that reason.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          jobDescription: opts.jobDescription,
          // "none" is a token this CLI invents. The wire value is null, which
          // CLEARS the owner; omitting the flag leaves ownership alone. The two
          // cannot both be said by absence, so one of them has to be sayable.
          ownerUserId: readOwner(opts.owner)
        });
        const { role: updated } = await client.roles.update(
          roleId,
          asRequestBody<UpdateRoleBody>(body)
        );

        printSuccess("Role updated.", {
          id: updated.id,
          name: updated.name,
          // `--owner none` writes a null, and `role get` reads that field back as
          // a null. The write has to answer the same way — see `absent`.
          owner: updated.ownerUserId ?? absent("(none)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────────
  role
    .command("delete")
    .description("Delete a Role, or file a request to delete one")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete "Refunds"

Notes:
  THIS DOES NOT PROMPT AND HAS NO --yes. The first call deletes the Role, or
  files the deletion request, with no confirmation and no dry run — unlike
  "customer delete", "user-group delete" and "skill-folder delete", which stop
  and ask on a terminal unless --yes is passed.

  THE ROLE'S SYSTEMS ARE NOT DELETED AND NOT REASSIGNED — THEY BECOME ORPHANS.
  Every agent, workflow, deployment, AI task and document template it held
  stops being reachable through any Role while continuing to exist and to run.
  Nothing errors and nothing reports it. Run "nexus role systems <role>" first
  and move what matters.

  A 2xx does not mean the Role is gone: if governance requires approval this
  files a request and reports status "pending", and the Role is STILL THERE.

  BRANCH ON "status", NEVER ON THE EXIT CODE OR ON "success". Both outcomes are
  a 0 exit and "success": true. --json carries "status": "deleted", or
  "status": "pending" with a "requestId" — and pending means every system the
  Role holds is still held, by a Role that still exists.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.delete(await resolveRoleId(client, ref));

        reportGovernedWrite(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── pause ─────────────────────────────────────────────────────────────────
  role
    .command("pause")
    .description("Stop a Role's work — its workflows and agents stop executing")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role pause "Refunds"

Notes:
  THIS STOPS 2 OF THE 6 KINDS A ROLE CAN HOLD. Workflows and agents are refused
  execution. Deployments KEEP SERVING, AI tasks KEEP RUNNING, document
  templates are unaffected, and external tools sit on a catalogue row shared
  across tenants that no per-Role state may touch. Run "nexus role systems
  <role>" first: on a Role whose systems are deployments and AI tasks this
  command changes nothing anyone would notice.

  IT CHANGES NO ACCESS. Nothing the Role grants is suspended, narrowed or
  revoked, and every member reaches afterwards exactly what they reached
  before. There is no command that suspends a Role's access, deliberately —
  emptying a Role's grants PUBLISHES every collection and workspace it was the
  last holder of to the whole organization, which is the opposite of what it
  sounds like.

  IT IS IDEMPOTENT AND KEEPS THE FIRST STOP. Pausing an already-paused Role
  succeeds and reports the ORIGINAL "pausedAt" — that field answers since when,
  and re-stamping it would destroy the only record of the original stop. There
  is no flag saying which of the two happened, and "nothing changed" is a
  SUCCESS: do not retry or alarm on it.

  RESUMING NEEDS "role.resume", WHICH IS A SEPARATE CAPABILITY. A key that can
  pause is not thereby able to resume. Check before stopping a Role you cannot
  start again.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: paused } = await client.roles.pause(await resolveRoleId(client, ref));

        printRecord(paused, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "pausedAt", label: "Paused at" },
          { key: "pausedByUserId", label: "Paused by" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── resume ────────────────────────────────────────────────────────────────
  role
    .command("resume")
    .description("Start a Role's work again")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role resume "Refunds"

Notes:
  A SYSTEM PAUSED ON ITS OWN STAYS PAUSED. A workflow or agent somebody stopped
  individually carries its own status, which this does not clear, and nothing
  in the output says so. This restores only the stop the Role itself was under.

  It also cannot restart what the pause never stopped — deployments, AI tasks,
  document templates and external tools were running throughout.

  Idempotent: resuming a running Role succeeds and changes nothing.

  A 403 here has TWO causes and only one is about you. "role.resume" not held
  is curable by asking the Role's owner. The organization having opted out of
  Roles is not — read the error "code": FEATURE_NOT_ENABLED means nobody in
  that organization can reach this command, and the Role's systems are running
  regardless, because the server declines to enforce a Role stop for an
  opted-out organization.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: resumed } = await client.roles.resume(await resolveRoleId(client, ref));

        printRecord(resumed, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "pausedAt", label: "Paused at" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── attach ────────────────────────────────────────────────────────────────
  const attach = role
    .command("attach")
    .description("Put a system in a Role — THIS MOVES IT off whatever Role held it")
    .argument("<role>", "Role name or UUID — the Role that will hold the system")
    .addOption(
      enumOption(
        "--type <type>",
        "Kind of system",
        ROLES_ATTACH_RESOURCE__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--id <id>", "The system's UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role attach "Support agent" --type agent --id 11111111-1111-4111-8111-111111111111

Notes:
  THIS IS A MOVE, NOT AN ADD. A system belongs to exactly ONE Role, so this
  revokes the previous Role's claim AND the access its members had through it.
  There is no sharing — reuse is a clone or a move.

  This command prints a warning naming the Role the system came from — its NAME
  and its UUID, because a name matching two Roles is refused as an argument. That
  warning is the only signal anyone gets that another team just lost it, and it
  goes to STDERR: under --json the machine-readable answer is "movedFrom", which
  stays a bare UUID.
  A name needs the roles:read scope. Without it the warning still prints, with
  the UUID alone.

  The system must already exist in this organization, or it is a 404.

  --type IS NOT "permissions grant --resource-type", AND THE OVERLAP IS WHAT
  MAKES THEM READ AS ONE ENUM. Exactly three spellings are common to both —
  agent, workflow, deployment. ai_task and document_template exist only here;
  knowledge, credential, access_card, template, document, feature, vibe_app and
  workspace exist only there. A value from one list is refused by the other.
  The two are also different acts: this one is EXCLUSIVE ownership, one Role
  per system org-wide, while a grant is a relation any number of principals may
  hold at once.

  KNOWLEDGE COLLECTIONS, FILE WORKSPACES AND EXTERNAL TOOLS ARE NOT ATTACHABLE
  HERE, and that follows from the same rule: several Roles legitimately hold the
  same one, which exclusive ownership cannot express. Each has its own grant
  instead — "nexus role grant-collection" and "nexus role grant-workspace". An
  external tool's grant has no verb in this CLI.`
    )
    .action(async (ref: string, opts: { type: string; id: string }) => {
      try {
        if (!isRoleResourceType(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${RESOURCE_TYPE_NAMES}. ` +
              `A Role holds operational systems — knowledge, credential and workspace belong to the permissions surface, not here.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const result = await client.roles.attachSystem(
          roleId,
          asRequestBody<AttachRoleSystemBody>({ resourceType: opts.type, resourceId: opts.id })
        );

        printSuccess("System attached.", {
          role: roleId,
          type: opts.type,
          id: opts.id,
          // A null here is "it belonged to no Role", and that is the SEIZURE
          // check: a script asks whether another team just lost this system, so
          // the answer cannot be a sentence it has to match on.
          movedFrom: result.movedFromRoleId ?? absent("(it belonged to no Role)")
        });

        if (result.movedFromRoleId !== null) {
          const names = await roleNamesById(client);
          printWarning(
            `This was a MOVE: the system was taken from Role ${describeRole(names, result.movedFromRoleId)}.`,
            "That Role's members have lost the access they had through it. Nothing else",
            "reports this. If it was not intended, attach the system back to that Role."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── detach ────────────────────────────────────────────────────────────────
  const detach = role
    .command("detach")
    .description("Take a system out of whichever Role holds it — this DISABLES its access")
    // The values come from the contract and commander enforces them on the
    // POSITIONAL. NO NORMALISER: the v1 path-var schema is a bare `z.enum` and
    // refuses `AGENT`, so case-folding here would accept a spelling the server
    // rejects — an undeclared widening.
    .addArgument(
      enumArgument("<type>", "Kind of system", ROLES_DETACH_RESOURCE__PATH_VARS_RESOURCE_TYPE)
    )
    .argument("<id>", "The system's UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role detach agent 11111111-1111-4111-8111-111111111111

Notes:
  NAMES NO ROLE, and that is not an omission: a system belongs to exactly one
  Role, so there is only one it could be leaving. The server resolves it and
  reports which.

  THE SYSTEM SURVIVES AND KEEPS RUNNING — as an orphan, reachable by nothing
  that resolves access through a Role, reporting no error. This is a disabling,
  not a tidy-up.

  Idempotent: a system already in no Role answers removed=false, not a 404.

  <type> IS THE SAME FIVE-VALUE LIST AS "role attach --type", AND IT IS NOT
  "permissions grant --resource-type" — that one is a different eleven-value
  list, and "nexus role attach --help" names what the two share and what they
  do not.`
    )
    .action(async (type: string, id: string) => {
      try {
        if (!isRoleResourceType(type)) {
          throw new Error(
            `Invalid system type "${type}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.detachSystem(type, id);

        printSuccess(result.removed ? "System detached." : "Nothing to detach.", {
          removed: result.removed,
          removedFromRole: result.removedFromRoleId ?? absent("(it belonged to no Role)")
        });

        if (result.removed) {
          printWarning(
            "That system is now in NO Role.",
            "It still exists and still runs, and it is reachable by nothing that resolves",
            "access through a Role. No error will be reported anywhere."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── add-member ────────────────────────────────────────────────────────────
  const addMember = role
    .command("add-member")
    .description("Seat a user in a Role as ADMIN or MEMBER, or change their tier")
    .argument("<role>", "Role name or UUID")
    .argument("<user-id>", "Clerk user id of somebody in your organization")
    .addOption(
      enumOption(
        "--tier <tier>",
        "Seat tier",
        ROLES_UPSERT_MEMBER__BODY_TIER,
        undefined,
        foldUpper
      ).default("MEMBER")
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-member "Support agent" user_abc
  $ nexus role add-member "Support agent" user_abc --tier ADMIN

Notes:
  AN UPSERT. Running it again with the other --tier MOVES that person between
  ADMIN and MEMBER rather than failing. The TIER line printed below is the tier
  that now stands, which is the only way to tell a promotion from an addition.

  A MEMBERSHIP ROW IS NOT A LABEL, AND IT IS NOT A CAPABILITY GRANT. It is how
  the server resolves a person's reach into the Role's systems, collections and
  workspaces. It seats nobody in a permission set, so on its own it carries no
  Role capability at all — run "nexus role add-permission-set-member" next to
  grant those.

  THE TIER IS RECORDED AND NOTHING READS IT. ADMIN and MEMBER resolve to the
  same reach and the same capabilities, so --tier ADMIN states an intent rather
  than conferring anything a MEMBER does not already hold.

  THE USER MUST ALREADY BE IN YOUR ORGANIZATION. A user id from another tenant
  is refused as "not found" — the same answer an id that exists nowhere gets,
  because telling the two apart would confirm somebody else's user exists.

  THE OWNER CANNOT BE A MEMBER. Ownership is a field on the Role, not a
  membership row, so seating the current owner is refused; use
  "nexus role update --owner" to hand the Role over instead.`
    )
    .action(async (ref: string, userId: string, opts: { tier: string }) => {
      try {
        const tier = opts.tier.toUpperCase();
        if (tier !== "ADMIN" && tier !== "MEMBER") {
          // Refused here rather than at the server: commander cannot express a
          // choice on a value option, and a 400 naming a Zod path is a worse
          // answer than naming the two words that work.
          throw new Error(`--tier must be ADMIN or MEMBER, not "${opts.tier}"`);
        }

        const client = createClient(program.optsWithGlobals());
        const member = await client.roles.upsertMember(await resolveRoleId(client, ref), {
          userId,
          tier
        });

        printSuccess("Member seated.", {
          userId: member.userId,
          tier: member.tier,
          roleId: member.roleId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── remove-member ─────────────────────────────────────────────────────────
  role
    .command("remove-member")
    .description("Remove a user's ADMIN or MEMBER standing in a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-member "Support agent" user_abc

Notes:
  IT DOES NOT TOUCH OWNERSHIP. An owner holds no membership row, so asking this
  to remove the OWNER is a no-op reporting removed=false. Use
  "nexus role update --owner" to hand the Role over.

  It DOES purge the user's permission-set rows, which no foreign key would do.
  Idempotent: removed=false for a user who held no standing.`
    )
    .action(async (ref: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.removeMember(await resolveRoleId(client, ref), userId);

        printSuccess(result.removed ? "Standing removed." : "That user held no standing.", {
          removed: result.removed
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── grant-collection / revoke-collection ──────────────────────────────────
  role
    .command("grant-collection")
    .description("Give a Role access to a knowledge collection")
    .argument("<role>", "Role name or UUID")
    .argument("<collection-id>", "Collection UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role grant-collection "Support agent" 22222222-2222-4222-8222-222222222222

Notes:
  Idempotent — re-granting an already-granted pair returns the existing row.
  A collection can be shared across several Roles, so this is a grant and not
  a move.`
    )
    .action(async (ref: string, collectionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grant } = await client.roles.grantCollection(await resolveRoleId(client, ref), {
          collectionId
        });

        printSuccess("Collection granted.", {
          grantId: grant.id,
          collectionId: grant.collectionId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("revoke-collection")
    .description("Remove a Role's access to a knowledge collection")
    .argument("<role>", "Role name or UUID")
    .argument("<grant-id>", "The GRANT row's UUID — not the collection's")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role revoke-collection "Support agent" 33333333-3333-4333-8333-333333333333

Notes:
  Takes the GRANT id, which "nexus role collection-grants" prints in the first
  column. Passing the collection id instead matches nothing.
  Idempotent: removed=false for a grant that was already gone.`
    )
    .action(async (ref: string, grantId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.revokeCollection(
          await resolveRoleId(client, ref),
          grantId
        );

        printSuccess(
          result.removed
            ? "Collection revoked."
            : 'No such grant. Nothing was removed. The id must be the GRANT row\'s, which "nexus role collection-grants" prints in the first column — a COLLECTION id matches nothing here.',
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── grant-workspace / revoke-workspace ────────────────────────────────────
  role
    .command("grant-workspace")
    .description("Give a Role access to a file workspace")
    .argument("<role>", "Role name or UUID")
    .argument("<workspace-id>", "Workspace UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role grant-workspace "Support agent" 44444444-4444-4444-8444-444444444444

Notes:
  Idempotent, and the same many-to-many exception as a collection grant.`
    )
    .action(async (ref: string, workspaceId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grant } = await client.roles.grantWorkspace(await resolveRoleId(client, ref), {
          workspaceId
        });

        printSuccess("Workspace granted.", { grantId: grant.id, workspaceId: grant.workspaceId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("revoke-workspace")
    .description("Remove a Role's access to a file workspace")
    .argument("<role>", "Role name or UUID")
    .argument("<grant-id>", "The GRANT row's UUID — not the workspace's")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role revoke-workspace "Support agent" 55555555-5555-4555-8555-555555555555

Notes:
  Takes the GRANT id, which "nexus role workspace-grants" prints first.
  Idempotent: removed=false for a grant that was already gone.`
    )
    .action(async (ref: string, grantId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.revokeWorkspace(
          await resolveRoleId(client, ref),
          grantId
        );

        printSuccess(
          result.removed
            ? "Workspace revoked."
            : 'No such grant. Nothing was removed. The id must be the GRANT row\'s, which "nexus role workspace-grants" prints in the first column — a WORKSPACE id matches nothing here.',
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  // ── permission-set writes ─────────────────────────────────────────────────
  const createPermSet = role
    .command("create-permission-set")
    .description("Create a permission set on a Role")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--surfaces <list>", 'Comma-separated surfaces, or "*" for every surface')
    .addOption(
      enumOption(
        "--relation <relation>",
        "Relation the set grants",
        ROLES_CREATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
        {
          alsoAccepts: ["none"],
          because:
            "'none' is this CLI's own token for a capability-only set; the wire value is null"
        }
      )
    )
    .addOption(
      enumInCompositeOption(
        "--capabilities <list>",
        "Comma-separated capabilities, e.g. role.view,team.view",
        ROLES_CREATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
        "each item"
      )
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create-permission-set "Support" --name Reviewers \\
      --surfaces inbox,agents --relation viewer
  $ nexus role create-permission-set "Support" --name Auditors \\
      --surfaces '*' --relation none --capabilities role.view,team.view

Notes:
  SURFACES IS AN ALLOW-LIST, NOT A FILTER. A --relation with an empty surfaces
  list reaches NOTHING and the server refuses that pair. Pass '*' for every
  surface, name the surfaces you mean, or --relation none for a set that grants
  capabilities and no resource access.
  Read RESOURCE REACH in the output rather than re-deriving it from the two
  fields — the server computes what the set actually reaches.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          surfaces: parseIdList(String(opts.surfaces)),
          resourceRelation:
            opts.relation === undefined ? undefined : readNullableString(String(opts.relation)),
          capabilities:
            opts.capabilities === undefined ? undefined : parseIdList(String(opts.capabilities))
        });
        const result = await client.roles.createPermissionSet(
          roleId,
          asRequestBody<CreateRolePermissionSetBody>(body)
        );

        printSuccess("Permission set created.", {
          id: result.permissionSet.id,
          name: result.permissionSet.name,
          resourceReach: result.resourceReach
        });
        warnIfReachesNothing(result.resourceReach);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const updatePermSet = role
    .command("update-permission-set")
    .description("Change a permission set")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .option("--name <name>", "New display name")
    .option("--surfaces <list>", 'REPLACES the surface list. Comma-separated, or "*"')
    .addOption(
      enumOption(
        "--relation <relation>",
        "Relation the set grants",
        ROLES_UPDATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
        {
          alsoAccepts: ["none"],
          because:
            "'none' is this CLI's own token for a capability-only set; the wire value is null"
        }
      )
    )
    .addOption(
      enumInCompositeOption(
        "--capabilities <list>",
        "REPLACES the capability list. Comma-separated",
        ROLES_UPDATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
        "each item"
      )
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-permission-set "Support" 22222222-2222-4222-8222-222222222222 --surfaces inbox

Notes:
  --capabilities and --surfaces REPLACE their lists rather than merging, so
  sending a subset removes the rest. At least one field is required.
  A SYSTEM set's definition is immutable in the product — only its membership
  can change — so this is refused on one.`
    )
    .action(async (ref: string, permissionSetId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          surfaces: opts.surfaces === undefined ? undefined : parseIdList(String(opts.surfaces)),
          resourceRelation:
            opts.relation === undefined ? undefined : readNullableString(String(opts.relation)),
          capabilities:
            opts.capabilities === undefined ? undefined : parseIdList(String(opts.capabilities))
        });
        const result = await client.roles.updatePermissionSet(
          roleId,
          permissionSetId,
          asRequestBody<UpdateRolePermissionSetBody>(body)
        );

        printSuccess("Permission set updated.", {
          id: result.permissionSet.id,
          resourceReach: result.resourceReach
        });
        warnIfReachesNothing(result.resourceReach);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("delete-permission-set")
    .description("Delete a permission set")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete-permission-set "Support" 22222222-2222-4222-8222-222222222222

Notes:
  A SYSTEM set cannot be deleted — the product seeds both templates and refuses
  to let them go. Idempotent: removed=false when the row was already gone.`
    )
    .action(async (ref: string, permissionSetId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deletePermissionSet(
          await resolveRoleId(client, ref),
          permissionSetId
        );

        printSuccess(result.removed ? "Permission set deleted." : "No such permission set.", {
          removed: result.removed
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── permission-set membership ─────────────────────────────────────────────
  role
    .command("add-permission-set-member")
    .description("Put a user into one of a Role's permission sets")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-permission-set-member "Support agent" 22222222-2222-4222-8222-222222222222 user_abc

Notes:
  THE USER MUST ALREADY BE IN THE ROLE — its owner, or seated by
  "nexus role add-member". A permission set is a SUBSET of the Role's team, so a
  user outside it is refused as "not found", the same answer a permission-set id
  that exists nowhere gets. Add the standing first, then the set.

  IT IS THE SET, NOT THE TIER, THAT CARRIES THE CAPABILITIES. "add-member"
  decides ADMIN or MEMBER; this decides which capabilities that person actually
  holds on the Role.

  Idempotent: added=false means that person was already in the set. Read the
  added line, not the exit status — both answer the same way.

  A SET THAT SHIPS WITH NEXUS ACCEPTS MEMBERS. Unlike
  "nexus role update-permission-set", which refuses a system set, seating
  somebody in Maintainers or Members is exactly what those templates are for.`
    )
    .action(async (ref: string, permissionSetId: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.addPermissionSetMember(
          await resolveRoleId(client, ref),
          permissionSetId,
          { userId }
        );

        printSuccess(result.added ? "Member seated in the set." : "Already in the set.", {
          added: result.added
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("remove-permission-set-member")
    .description("Take a user out of one of a Role's permission sets")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-permission-set-member "Support agent" 22222222-2222-4222-8222-222222222222 user_abc

Notes:
  THIS IS THE NARROW REVOCATION. "nexus role delete-permission-set" is NOT a
  substitute — destroying the set takes its capabilities from everybody else in
  it too.

  IT DOES NOT TOUCH THE ROLE. The user keeps their ADMIN or MEMBER standing and
  every other set they are in. "nexus role remove-member" is what ends the
  standing, and it purges permission-set rows on its way out.

  Idempotent, and THE THREE ABSENCES ANSWER ALIKE: no such permission set, a set
  belonging to another Role, and a user who was never in it all report
  removed=false. So removed=false is not proof the id was right — read the set
  back with "nexus role permission-sets" if you need to know which it was.`
    )
    .action(async (ref: string, permissionSetId: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.removePermissionSetMember(
          await resolveRoleId(client, ref),
          permissionSetId,
          userId
        );

        printSuccess(
          result.removed ? "Member removed from the set." : "That user was not in the set.",
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── access requests ───────────────────────────────────────────────────────
  const requestAccess = role
    .command("request-access")
    .description("Ask for access to one of a Role's systems")
    .argument("<role>", "Role name or UUID")
    .addOption(
      enumOption(
        "--type <type>",
        "Kind of system",
        ROLE_ACCESS_REQUESTS_CREATE__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--id <id>", "The system's UUID")
    .option("--note <text>", "Why you need it, up to 2000 characters")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role request-access "Support" --type agent --id 11111111-1111-4111-8111-111111111111 --note "on call"

Notes:
  Files a PENDING request. Someone with the review permission then decides it
  with "nexus role review-access".`
    )
    .action(async (ref: string, opts: { type: string; id: string; note?: string }) => {
      try {
        if (!isRoleResourceType(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.createAccessRequest(
          await resolveRoleId(client, ref),
          { resourceType: opts.type, resourceId: opts.id, note: opts.note ?? null }
        );

        printSuccess("Access requested.", { id: request.id, status: request.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const reviewAccess = role
    .command("review-access")
    .description("Approve or reject an access request")
    .argument("<role>", "Role name or UUID")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_ACCESS_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-access "Support" 33333333-3333-4333-8333-333333333333 --status APPROVED

Notes:
  PENDING is the starting state and never a target, so only the two verdicts are
  accepted. Deciding is a SEPARATE permission from seeing the queue: a key that
  can list requests may still be refused here.`
    )
    .action(async (ref: string, requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.reviewAccessRequest(
          await resolveRoleId(client, ref),
          requestId,
          { status: readVerdict(String(opts.status)) }
        );

        printSuccess("Access request reviewed.", { id: request.id, status: request.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── governance ────────────────────────────────────────────────────────────
  role
    .command("governance")
    .description("Read the organization's Role-management governance settings")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role governance

Notes:
  ORG-ADMIN ONLY — a non-admin key gets a 403 here and cannot learn in advance
  whether "role create" will create or merely file a request.

  The drivable path without admin rights is the other direction: run
  "nexus role create", read what it reports, and if it filed a request follow it
  with "nexus role creation-requests" / "creation-request <id>".

  REQUIRES APPROVAL DOES NOT PREDICT WHAT YOUR WRITE WILL DO. It is the
  organization's policy for the action, not a verdict about your key: with
  REQUIRES APPROVAL yes on CREATE_ROLE, an org-admin key still creates the role
  outright and files no request. The branch a write actually took is in the
  STATUS the write itself returns — read that, never this table.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { settings } = await client.roles.getManagementSettings();

        printList(settings, undefined, [
          { key: "action", label: "ACTION", width: 22 },
          { key: "requiresApproval", label: "REQUIRES APPROVAL", width: 18 },
          {
            key: "grants",
            label: "ALLOWED",
            width: 44,
            format: (val) =>
              Array.isArray(val) && val.length > 0
                ? val
                    .map((g) => {
                      const grant = g as { subjectType: string; subjectId: string | null };
                      return grant.subjectId === null
                        ? grant.subjectType
                        : `${grant.subjectType}:${grant.subjectId}`;
                    })
                    .join(", ")
                : "(nobody)"
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const creationRequests = role
    .command("creation-requests")
    .description("List filed requests to CREATE a Role")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLE_CREATION_REQUESTS_LIST__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role creation-requests --status PENDING

Notes:
  Every row is a Role that DOES NOT EXIST yet. This is the poll route that makes
  a governed create drivable without org-admin rights.`
    )
    .action(async (opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { requests } = await client.roles.listCreationRequests({
          status: readAccessRequestStatus(opts.status)
        });

        printList(requests, undefined, [
          { key: "id", label: "REQUEST", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "name", label: "PROPOSED NAME", width: 24 },
          { key: "requestedByUserId", label: "BY", width: 30 },
          { key: "createdRoleId", label: "CREATED ROLE", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("creation-request")
    .description("Show one filed Role-creation request")
    .argument("<request-id>", "Request UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role creation-request 44444444-4444-4444-8444-444444444444

Notes:
  CREATED ROLE is null until the request is approved, and holds the new Role's
  id afterwards — so this is how a caller learns the id of the Role its own
  request produced.`
    )
    .action(async (requestId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.getCreationRequest(requestId);

        printRecord(request, [
          { key: "id", label: "Request" },
          { key: "status", label: "Status" },
          { key: "name", label: "Proposed name" },
          { key: "jobDescription", label: "Job description" },
          { key: "ownerUserId", label: "Proposed owner" },
          { key: "requestedByUserId", label: "Requested by" },
          { key: "reviewedByUserId", label: "Reviewed by" },
          { key: "createdRoleId", label: "Created role" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const reviewCreation = role
    .command("review-creation-request")
    .description("Approve or reject a filed Role-creation request")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_CREATION_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-creation-request 44444444-4444-4444-8444-444444444444 --status APPROVED

Notes:
  APPROVING IS WHAT CREATES THE ROLE. This is the write itself, not bookkeeping
  on a write that already happened. The new Role's id comes back as CREATED
  ROLE.`
    )
    .action(async (requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.reviewCreationRequest(requestId, {
          status: readVerdict(String(opts.status))
        });

        printSuccess("Creation request reviewed.", {
          id: request.id,
          status: request.status,
          // Null on a REJECTED verdict, and on an APPROVED one it is the id of
          // the Role the request produced — the only place a caller learns it.
          createdRoleId: request.createdRoleId ?? absent("(nothing created)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const deletionRequests = role
    .command("deletion-requests")
    .description("List filed requests to DELETE a Role")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLE_DELETION_REQUESTS_LIST__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role deletion-requests --status PENDING

Notes:
  Every row names a Role that is STILL THERE.`
    )
    .action(async (opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { requests } = await client.roles.listDeletionRequests({
          status: readAccessRequestStatus(opts.status)
        });

        printList(requests, undefined, [
          { key: "id", label: "REQUEST", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "roleId", label: "ROLE", width: 36 },
          { key: "requestedByUserId", label: "BY", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("deletion-request")
    .description("Show one filed Role-deletion request")
    .argument("<request-id>", "Request UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role deletion-request 55555555-5555-4555-8555-555555555555

Notes:
  PENDING MEANS THE ROLE IS STILL THERE. A filed request is not a deletion —
  the Role, its systems and its members are untouched until somebody approves
  it with "nexus role review-deletion-request".
  Takes the REQUEST id, which "nexus role deletion-requests" prints first — not
  the Role's.
  A reviewed request is KEPT with its verdict rather than deleted, so a row
  here can be APPROVED and long since acted on.`
    )
    .action(async (requestId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.getDeletionRequest(requestId);

        printRecord(request, [
          { key: "id", label: "Request" },
          { key: "status", label: "Status" },
          { key: "roleId", label: "Role" },
          { key: "requestedByUserId", label: "Requested by" },
          { key: "reviewedByUserId", label: "Reviewed by" },
          { key: "reviewedAt", label: "Reviewed at" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const reviewDeletion = role
    .command("review-deletion-request")
    .description("Approve or reject a filed Role-deletion request")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_DELETION_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-deletion-request 55555555-5555-4555-8555-555555555555 --status APPROVED

Notes:
  APPROVING IS WHAT DELETES THE ROLE, and it ORPHANS every system the Role held
  — they keep existing and keep running, reachable by nothing that resolves
  access through a Role, reporting no error. Run
  "nexus role systems <role>" first and move what matters.

  On APPROVED it prints a warning naming the Role — its NAME and its UUID. The
  name is read BEFORE the deletion, because a deletion request carries only the
  Role's id and nothing can resolve the name afterwards. Without the roles:read
  scope the warning still prints, with the UUID alone.`
    )
    .action(async (requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const verdict = readVerdict(String(opts.status));
        // Read the names BEFORE the review, and only when approving. Approving is
        // what DELETES the Role, and `RoleDeletionRequest` carries only `roleId` —
        // so after the call there is no name left anywhere to resolve. A rejection
        // deletes nothing and prints no warning, so it pays for no lookup.
        const names =
          verdict === "APPROVED" ? await roleNamesById(client) : new Map<string, string>();
        const { request } = await client.roles.reviewDeletionRequest(requestId, {
          status: verdict
        });

        printSuccess("Deletion request reviewed.", { id: request.id, status: request.status });
        if (request.status === "APPROVED") {
          printWarning(
            `Role ${describeRole(names, request.roleId)} is gone, and every system it held is now an ORPHAN.`,
            "They still exist and still run, in no Role, reachable by nothing that resolves",
            "access through one. Nothing else reports this."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── the job model ─────────────────────────────────────────────────────────
  const createJobType = role
    .command("create-job-type")
    .description("Add a job type to the organization's library")
    .requiredOption("--body <json>", "The whole job type as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create-job-type --body ./support-agent.json
  $ cat jobtype.json | nexus role create-job-type --body -

Notes:
  --body IS REQUIRED because "parts" is a nested array of rate inputs and no
  flag spelling of it is honest.
${JOB_TYPE_BODY_SHAPE}

  null IS NOT ZERO. fte:null is a full contract; a null expression means "use
  the basis' built-in one"; an EMPTY STRING expression evaluates to zero, which
  is what a credit type with no cost wants.

  basis "CUSTOM" with costExpression null is REFUSED — CUSTOM has no built-in
  cost expression, so a null one would price every scope line quantifying this
  type at ZERO with no error on any read.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.createJobType(asRequestBody<RoleJobTypeBody>(body));

        printSuccess("Job type created.", {
          id: result.jobType.id,
          name: result.jobType.name,
          repricedScopeLines: result.repricedScopeLines
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const updateJobType = role
    .command("update-job-type")
    .description("Replace a job type (PUT — send the whole object)")
    .argument("<job-type-id>", "Job-type UUID")
    .requiredOption("--body <json>", "The whole job type as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-job-type 66666666-6666-4666-8666-666666666666 --body ./support-agent.json

Notes:
  A PUT OF THE WHOLE OBJECT. An omitted field is a validation error, not "leave
  it alone" — read the current row with "nexus role job-types --json", change
  what you mean, send it all back.
${JOB_TYPE_BODY_SHAPE}

  A JOB TYPE IS SHARED ACROSS ROLES. REPRICED SCOPE LINES in the output is how
  many lines this write just repriced org-wide. That is the blast radius, and it
  is the reason the number is reported rather than left to be discovered.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (jobTypeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.updateJobType(
          jobTypeId,
          asRequestBody<RoleJobTypeBody>(body)
        );

        printSuccess("Job type updated.", {
          id: result.jobType.id,
          repricedScopeLines: result.repricedScopeLines
        });
        if (result.repricedScopeLines > 0) {
          printWarning(
            `${String(result.repricedScopeLines)} scope line(s) were REPRICED by this edit.`,
            "A job type is shared, so this changed what other Roles cost — not just this one.",
            // The job model's cost, which is the Scope's. Naming the coverage
            // read here sent a caller to a figure this write cannot move.
            "Re-read the affected Roles' scope lines if the money matters."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("delete-job-type")
    .description("Remove a job type from the organization's library")
    .argument("<job-type-id>", "Job-type UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete-job-type 66666666-6666-4666-8666-666666666666

Notes:
  ORG-WIDE. A job type is shared across every Role, so this removes it from
  the library for all of them, not from the one you happen to be looking at.

  REFUSED WHILE ANYTHING STILL QUANTIFIES IT, AND NOTHING IS MODIFIED. A job
  type that any scope line names is not deletable: the call answers 409 Conflict
  and states how many scope lines still quantify it. No line loses its price
  model and no row is touched — RoleScopeLine's key into the library is NO
  ACTION, so the database refuses the delete whatever anything else does. Clear
  those lines with "nexus role set-scope-lines" first, then delete.

  THE COUNT IS ORG-WIDE AND NAMES NO ROLE. It is every scope line in the
  organization, and the message cannot say which Roles hold them, so
  "nexus role scope-lines <role>" per Role is still how you find them.

  Once it IS deletable there is no confirmation prompt and no undo.
  Verify with "nexus role job-types" — the id is gone from the library.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (jobTypeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deleteJobType(jobTypeId);

        printSuccess("Job type deleted.", { id: result.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("automation-settings")
    .description("Read the organization's working-time assumptions and currency")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role automation-settings

Notes:
  Every coverage figure in the organization rests on these three numbers, and a
  null currency is why a coverage read can answer money "not modelled".

  THE WHOLE OBJECT CAN BE ABSENT, AND ABSENCE IS A SUCCESS. An organization
  that never stated its working time has no settings row at all: this exits 0,
  prints "not configured", and under --json emits the literal document null —
  not {}, not an error. That null is what makes coverage.reason answer
  NO_WORKING_TIME_MODEL for EVERY Role in the organization at once, so read it
  here before treating a "not modelled" coverage figure as a per-Role problem.
  Write the row with "nexus role set-automation-settings".`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const settings = await client.roles.getAutomationSettings();

        printStatedOrNothing(settings, "This organization's automation settings", [
          { key: "organizationId", label: "Organization" },
          { key: "hoursPerDay", label: "Hours / day" },
          { key: "daysPerWeek", label: "Days / week" },
          { key: "workingWeeksPerYear", label: "Working weeks / yr" },
          {
            key: "currency",
            label: "Currency",
            format: (val) => (val === null ? "(none stated)" : String(val))
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-automation-settings")
    .description("Replace the organization's working-time assumptions and currency")
    .option("--hours-per-day <n>", "Hours in a working day, greater than 0")
    .option("--days-per-week <n>", "Days in a working week, greater than 0")
    .option("--working-weeks <n>", "Working weeks in a year, greater than 0")
    .option("--currency <code>", 'ISO 4217 code such as EUR, or "none" to clear it')
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-automation-settings --hours-per-day 8 --days-per-week 5 \\
      --working-weeks 46 --currency EUR

Notes:
  ALL FOUR ARE REQUIRED — this replaces the whole object, so an omitted field is
  a 400 rather than "leave it alone". The command names every missing one at
  once instead of making you discover them one 400 at a time.

  The three numbers have NO null form: a zero-length day makes every coverage
  figure in the organization unusable. --currency none IS accepted and means the
  organization states no currency, which turns every money figure into
  "not modelled".`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const fromFlags = {
          hoursPerDay:
            opts.hoursPerDay === undefined
              ? undefined
              : readPositiveNumber(String(opts.hoursPerDay), "--hours-per-day"),
          daysPerWeek:
            opts.daysPerWeek === undefined
              ? undefined
              : readPositiveNumber(String(opts.daysPerWeek), "--days-per-week"),
          workingWeeksPerYear:
            opts.workingWeeks === undefined
              ? undefined
              : readPositiveNumber(String(opts.workingWeeks), "--working-weeks"),
          currency:
            opts.currency === undefined ? undefined : readNullableString(String(opts.currency))
        };
        const body = mergeBodyWithFlags(base, fromFlags);
        requireAll(
          body,
          [
            { field: "hoursPerDay", flag: "hours-per-day" },
            { field: "daysPerWeek", flag: "days-per-week" },
            // The body key is workingWeeksPerYear; the option is --working-weeks.
            { field: "workingWeeksPerYear", flag: "working-weeks" },
            { field: "currency", flag: "currency" }
          ],
          "This route replaces the whole object, so every field must be sent."
        );
        const settings = await client.roles.upsertAutomationSettings(
          asRequestBody<RoleAutomationSettingsBody>(body)
        );

        printSuccess("Automation settings updated.", {
          hoursPerDay: settings.hoursPerDay,
          daysPerWeek: settings.daysPerWeek,
          workingWeeksPerYear: settings.workingWeeksPerYear,
          // A null currency is why a coverage read answers money "not modelled",
          // so a script has to be able to see it as a null.
          currency: settings.currency ?? absent("(none stated)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── the Scope — the job model's per-Role work items ───────────────────────
  //
  // NOT the Role's workload. `RoleWorkload` is a different table behind a
  // different route, it is the coverage denominator, and it is not writable
  // from here. Calling the Scope "the workload" in this section's own comment
  // is how the same conflation reached three help strings below it.
  role
    .command("scope-lines")
    .description("List a Role's scope lines — the job model's per-Role work items")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role scope-lines "Support agent"

Notes:
  UNRESOLVED VARIABLES is not decoration. A non-empty list means these lines'
  job types reference variables this Role does not define, so the lines are
  priced from an incomplete model. Define them with "nexus role set-variables".`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listScopeLines(await resolveRoleId(client, ref));

        printList(result.lines, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "jobTypeId", label: "JOB TYPE", width: 36 },
          { key: "quantity", label: "QTY", width: 8 },
          { key: "scope", label: "SCOPE", width: 40 }
        ]);
        if (result.unresolvedVariables.length > 0) {
          printWarning(
            `${String(result.unresolvedVariables.length)} variable(s) referenced by these lines are NOT defined on this Role.`,
            `Keys: ${result.unresolvedVariables.join(", ")}`,
            "Any part referencing one of these has no value, so the lines depending on it are",
            'priced from an incomplete model. Define them with "nexus role set-variables".'
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-scope-lines")
    .description("REPLACE a Role's scope lines")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--body <json>", "{ lines: [...] } as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role scope-lines "Support" --json > lines.json   # read first
  $ nexus role set-scope-lines "Support" --body ./lines.json

Notes:
${SCOPE_LINES_BODY_SHAPE}

  THIS REPLACES THE WHOLE LIST. A line's identity is its index in the array, so
  anything absent from "lines" is DELETED. Read, modify, send the whole list
  back. { "lines": [] } removes every line and leaves the Role with no Scope.

  A quantity of 0 is LEGAL and is not a delete — it records a decision, and the
  line keeps its scope sentence.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceScopeLines(
          roleId,
          asRequestBody<RoleScopeLinesBody>(body)
        );

        printSuccess("Scope lines replaced.", { lines: result.lines.length });
        if (result.unresolvedVariables.length > 0) {
          printWarning(
            `${String(result.unresolvedVariables.length)} referenced variable(s) are NOT defined on this Role.`,
            `Keys: ${result.unresolvedVariables.join(", ")}`,
            "These lines are priced from an incomplete model until you define them."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("variables")
    .description("List a Role's variables — the values its job-type parts reference")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role variables "Support agent"

Notes:
  A blank VALUE means UNSET, never zero. Any part referencing an unset variable
  is unresolved and its scope line is priced from an incomplete model.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { variables } = await client.roles.listVariables(await resolveRoleId(client, ref));

        printList(variables, undefined, [
          { key: "key", label: "KEY", width: 24 },
          { key: "label", label: "LABEL", width: 26 },
          {
            key: "value",
            label: "VALUE",
            width: 14,
            format: (val) => (val === null ? "(unset)" : String(val))
          },
          { key: "unit", label: "UNIT", width: 14 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-variables")
    .description("REPLACE a Role's variables")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--body <json>", "{ variables: [...] } as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role variables "Support" --json > vars.json    # read first
  $ nexus role set-variables "Support" --body ./vars.json

Notes:
  REPLACES THE WHOLE LIST, exactly like the scope lines. Keys must be unique.
${VARIABLES_BODY_SHAPE}

  value:null MEANS UNSET AND IS NOT ZERO. Sending 0 asserts a measured zero;
  sending null leaves every part referencing that key unresolved. Both are
  accepted and they price differently, so nothing downstream will tell you
  which you meant.

  A VARIABLE CARRIES NO DIMENSION, AND A "dimension" KEY IS REFUSED BY NAME.
  "unit" is free text for a human and nothing parses it. The DIMENSIONAL check —
  multiply each term's exponents out and ask whether the result lands on money a
  year — reads exponents nothing written here can carry, so it is unreachable
  from this command however the variables are spelled.

  THAT IS NOT "expressions are checked elsewhere and not here". Nothing on this
  API parses one at all: a job type's costExpression, hoursExpression and
  revenueExpression are infix STRINGS stored verbatim, so a malformed one is
  accepted by every write here and fails only in the browser that evaluates it.
  The dimensioned models the product DOES check are a different shape on a
  different row, and they are authored in the dashboard.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const { variables } = await client.roles.replaceVariables(
          roleId,
          asRequestBody<RoleVariablesBody>(body)
        );

        printSuccess("Variables replaced.", {
          variables: variables.length,
          unset: variables.filter((v) => v.value === null).length
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("working-year")
    .description("Read a Role's working year")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role working-year "Support agent"

Notes:${WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const year = await client.roles.getWorkingYear(await resolveRoleId(client, ref));
        const notStated = (val: unknown): string => (val === null ? NOT_STATED : String(val));

        printStatedOrNothing(year, "This Role's working year", [
          { key: "roleId", label: "Role" },
          { key: "calendarWeeks", label: "Calendar weeks", format: notStated },
          { key: "paidLeaveWeeks", label: "Paid leave (weeks)", format: notStated },
          { key: "publicHolidayDays", label: "Public holidays (days)", format: notStated },
          { key: "sicknessDays", label: "Sickness (days)", format: notStated }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-working-year")
    .description("Replace a Role's working year")
    .argument("<role>", "Role name or UUID")
    .option("--calendar-weeks <n>", 'Weeks in the year, or "none" for no override')
    .option("--paid-leave <n>", 'Paid leave in weeks, or "none"')
    .option("--public-holidays <n>", 'Public holidays in days, or "none"')
    .option("--sickness <n>", 'Expected sickness in days, or "none"')
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-working-year "Support" --calendar-weeks 52 --paid-leave 5 \\
      --public-holidays 10 --sickness none

Notes:
  ALL FOUR ARE REQUIRED — this replaces the whole object.

  "none" MEANS NOT STATED. IT IS NOT ZERO. --sickness none records that nobody
  has stated expected sickness; --sickness 0 asserts zero expected sickness.
  Both are accepted, they produce different job-model denominators, and nothing
  downstream will tell you which you meant.
${WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK}
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          calendarWeeks:
            opts.calendarWeeks === undefined
              ? undefined
              : readNullableNumber(String(opts.calendarWeeks), "--calendar-weeks"),
          paidLeaveWeeks:
            opts.paidLeave === undefined
              ? undefined
              : readNullableNumber(String(opts.paidLeave), "--paid-leave"),
          publicHolidayDays:
            opts.publicHolidays === undefined
              ? undefined
              : readNullableNumber(String(opts.publicHolidays), "--public-holidays"),
          sicknessDays:
            opts.sickness === undefined
              ? undefined
              : readNullableNumber(String(opts.sickness), "--sickness")
        });
        requireAll(
          body,
          [
            { field: "calendarWeeks", flag: "calendar-weeks" },
            // Three of these four options are SHORTER than their body keys.
            { field: "paidLeaveWeeks", flag: "paid-leave" },
            { field: "publicHolidayDays", flag: "public-holidays" },
            { field: "sicknessDays", flag: "sickness" }
          ],
          'This route replaces the whole object. Pass "none" for a term nobody has stated.'
        );
        const year = await client.roles.upsertWorkingYear(
          roleId,
          asRequestBody<RoleWorkingYearBody>(body)
        );

        // 🚨 EACH OF THESE FOUR IS THE `none` A CALLER JUST SENT, READ BACK. The
        // whole point of the token is that null and 0 are different denominators,
        // so answering the null as English destroys the distinction on the one
        // channel that exists to preserve it — and `role working-year` returns
        // the same fields as proper nulls.
        printSuccess("Working year updated.", {
          calendarWeeks: year.calendarWeeks ?? absent(NOT_STATED),
          paidLeaveWeeks: year.paidLeaveWeeks ?? absent(NOT_STATED),
          publicHolidayDays: year.publicHolidayDays ?? absent(NOT_STATED),
          sicknessDays: year.sicknessDays ?? absent(NOT_STATED)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── the Role's WORK: its duties, and the tasks it proposes ────────────────
  role
    .command("responsibilities")
    .description("List a Role's duties — what it is answerable for")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role responsibilities "Support agent"

Notes:
  POSITION IS AN INSERTION ORDER, NOT A RANK. Removing a duty leaves a hole
  (0, 1, 3) and nothing backfills it, so read the list rather than the number.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listResponsibilities(await resolveRoleId(client, ref));

        printList(result.responsibilities, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "position", label: "POS", width: 5 },
          { key: "text", label: "DUTY", width: 70 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("add-responsibility")
    .description("Add ONE duty to a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<text>", "The duty, in your own words")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-responsibility "Support" "Answer billing disputes under 200 euros"

Notes:
  ONE PER CALL, AND THERE IS NO WHOLE-LIST REPLACE. That is deliberate: a
  replace re-mints every row id on every save, and a duty has to stay
  referenceable because a task's duty checklist points at it. Seeding
  several duties means several calls.

  The server assigns the id and appends at the END of the list. Blank text is
  refused; 500 characters is the ceiling — anything longer is a job
  description, which belongs on "nexus role update --job-description".`
    )
    .action(async (ref: string, text: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const duty = await client.roles.addResponsibility(roleId, { text });

        printSuccess("Duty added.", { id: duty.id, position: duty.position, text: duty.text });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("remove-responsibility")
    .description("Remove ONE duty from a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<responsibility-id>", 'Duty UUID — read it from "nexus role responsibilities"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role responsibilities "Support" --json      # read the ids first
  $ nexus role remove-responsibility "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4

Notes:
  IT ALSO UNTICKS THE DUTY FROM EVERY TASK THAT TICKED IT. The link rows go
  with the duty, and this output reports the duty alone.

  A duty that is not this Role's answers 404, so a success means exactly one
  row went. It leaves a hole in POSITION and nothing backfills it.`
    )
    .action(async (ref: string, responsibilityId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const removed = await client.roles.removeResponsibility(roleId, responsibilityId);

        printSuccess("Duty removed.", { id: removed.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("tasks")
    .description("List a Role's proposed tasks and their assignments")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support agent"

Notes:
  A TASK ID IS DURABLE — a task saved with its id is updated in place and keeps
  it. AN ASSIGNMENT HAS NO ID ON THIS CONTRACT AT ALL, and that is enforced
  rather than merely omitted: a payload carrying one is refused. Its ARM is its
  identity, and an arm is an OBJECT keyed by "kind" — ${ASSIGNMENT_KIND_NAMES}:

    { "kind": "person",   "userId": "<user id>" }
    { "kind": "resource", "resourceType": "agent", "resourceId": "<uuid>" }

  A "resourceType" is one of these:
    ${RESOURCE_TYPE_NAMES}

  THERE IS NO "person:<userId>" STRING FORM, and sending one is refused. That
  spelling is the DATABASE's uniqueness key on the assignment row, never the
  wire.

  THE WRITE IS "set-tasks", AND IT REPLACES THE WHOLE LIST. Send each task's id
  back or that task is deleted and re-created, which takes its ticked duties with
  it. There is still no graduation verb: that one is refused outright rather than
  merely absent, and the public contract carries the reason.

  ASSIGNMENTS carry the ids they point AT and no display names. Resolve a person
  with "nexus role members" and a system with "nexus role systems".`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listTasks(await resolveRoleId(client, ref));

        // THE ROWS GO IN WHOLE, and the count is a COLUMN `format`. Rewriting
        // `assignments` to its length before this call would reach `--json` too —
        // printList dumps its rows as-is there — so a scripted caller would get a
        // number where the help text above tells it to resolve the ids. The table
        // still needs a count, because a column cannot render the union arms.
        printList(result.tasks, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "position", label: "POS", width: 5 },
          { key: "name", label: "TASK", width: 44 },
          { key: "occurrencesPerYear", label: "OCC/YR", width: 8 },
          { key: "peoplePerYear", label: "PPL/YR", width: 8 },
          {
            key: "assignments",
            label: "ASSIGNED",
            width: 9,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-tasks")
    .description("REPLACE a Role's task list")
    .argument("<role>", "Role name or UUID")
    .requiredOption(
      "--body <json>",
      "{ tasks: [...] } — Notes name every key — as JSON, a .json file, or '-' for stdin"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support" --json > tasks.json   # read first
  $ nexus role set-tasks "Support" --body ./tasks.json

Notes:
  THE BODY IS { "tasks": [ ... ] } AND A TASK IS:

    { "id": "<uuid — OMIT to create>", "name": "Answer the phone",
      "description": null, "occurrencesPerYear": null, "peoplePerYear": null,
      "revenuePerYear": null, "assignments": [] }

  Every key but "id" is required. null is how you say "nobody stated this" and
  is NOT zero — a defaulted 0 prices unfinished work as free.

  AN ASSIGNMENT IS AN OBJECT KEYED BY "kind" (${ASSIGNMENT_KIND_NAMES}), never a
  "<type>:<id>" string:

    { "kind": "person",   "userId": "<user id>" }
    { "kind": "resource", "resourceType": "agent", "resourceId": "<uuid>" }

  A "resourceType" is one of these:
    ${RESOURCE_TYPE_NAMES}

  A "kind" outside that pair is refused naming both of them; a "resourceType"
  outside that list is refused naming the list. An assignment carries no id and
  needs none: its arm is its identity.

  THIS REPLACES THE WHOLE LIST. Anything absent from "tasks" is DELETED and the
  answer is still a success. Read, modify, send the whole list back. The array
  index is the position, so a reorder is the same request with the elements
  moved.

  SEND EACH TASK'S id BACK. A task carrying its id is updated in place and keeps
  it; one without an id is created. Keeping the id is what keeps that task's
  ticked duties attached — a re-minted id takes every tick with it. This is the
  single most expensive thing to get wrong here, and dropping the ids still
  answers success.

  Every id is checked against this Role and this organization first. A foreign
  task, person or system is refused with a COUNT, never the ids.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceTasks(roleId, asRequestBody<RoleTasksBody>(body));

        printSuccess("Task list replaced.", { tasks: result.tasks.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("task-duties")
    .description("List the duties one task ticks")
    .argument("<role>", "Role name or UUID")
    .argument("<task-id>", 'Task UUID — read it from "nexus role tasks"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support" --json            # read the task ids
  $ nexus role task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4

Notes:
  IDS ONLY, NEVER THE DUTY TEXT. The text has one home and a different scope:
  read it with "nexus role responsibilities" and match on the id. Both reads are
  required to show a checklist a human can read.

  Ordered by the duty's own position, never by the link and never by the order
  anyone ticked them.`
    )
    .action(async (ref: string, taskId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const result = await client.roles.listTaskDuties(roleId, taskId);

        printList(
          result.responsibilityIds.map((id) => ({ responsibilityId: id })),
          undefined,
          [{ key: "responsibilityId", label: "DUTY ID", width: 36 }]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-task-duties")
    .description("REPLACE the set of duties one task ticks")
    .argument("<role>", "Role name or UUID")
    .argument("<task-id>", 'Task UUID — read it from "nexus role tasks"')
    .requiredOption("--body <json>", "{ responsibilityIds: [...] } as JSON, .json file, or '-'")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --body '{"responsibilityIds":["a1b2..."]}'
  $ nexus role set-task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --body '{"responsibilityIds":[]}'

Notes:
  THIS REPLACES THE WHOLE SET. An empty array unticks every duty and answers
  success, which is the correct request for clearing the last tick rather than
  an accident.

  Every id is checked against THIS Role first. A duty belonging to another Role
  is refused with a COUNT, never the ids. The same duty twice is refused
  outright — the database could not store it.`
    )
    .action(async (ref: string, taskId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceTaskDuties(
          roleId,
          taskId,
          asRequestBody<RoleTaskDutiesBody>(body)
        );

        printSuccess("Duty ticks replaced.", { duties: result.responsibilityIds.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("system-policy")
    .description("Read a Role's system policy")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role system-policy "Support agent"
  $ nexus role system-policy "Support agent" --json

Notes:
  "NOT CONFIGURED" IS A SUCCESS, NOT AN EMPTY POLICY. A Role nobody has
  authored a policy for prints that line and exits 0; under --json it is a
  literal null. It is NOT the same as every flag being false — nothing has been
  stated, and there is NO organization-level system policy to inherit from, so
  an unauthored policy is an absence rather than a set of borrowed values.
  Write it with "nexus role set-system-policy", which REPLACES the whole
  policy rather than patching it.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const policy = await client.roles.getSystemPolicy(await resolveRoleId(client, ref));

        printStatedOrNothing(policy, "This Role's system policy", [
          { key: "roleId", label: "Role" },
          { key: "allowProposals", label: "Allow proposals" },
          { key: "requireReview", label: "Require review" },
          { key: "startPaused", label: "Start paused" },
          { key: "autoPush", label: "Auto push" },
          { key: "notifyTakeover", label: "Notify takeover" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  role
    .command("set-system-policy")
    .description("Replace a Role's system policy")
    .argument("<role>", "Role name or UUID")
    .option("--allow-proposals <bool>", "true or false")
    .option("--require-review <bool>", "true or false")
    .option("--start-paused <bool>", "true or false")
    .option("--auto-push <bool>", "true or false")
    .option("--notify-takeover <bool>", "true or false")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-system-policy "Support" --allow-proposals true \\
      --require-review true --start-paused true --auto-push false \\
      --notify-takeover true

Notes:
  ALL FIVE ARE REQUIRED — this replaces the whole policy, so an omitted flag is
  a 400 rather than "leave it alone".
  A value that is not exactly "true" or "false" is refused rather than read as
  false, because a typo that silently disables a review gate is the worst
  outcome available here.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          allowProposals:
            opts.allowProposals === undefined
              ? undefined
              : readBoolean(String(opts.allowProposals), "--allow-proposals"),
          requireReview:
            opts.requireReview === undefined
              ? undefined
              : readBoolean(String(opts.requireReview), "--require-review"),
          startPaused:
            opts.startPaused === undefined
              ? undefined
              : readBoolean(String(opts.startPaused), "--start-paused"),
          autoPush:
            opts.autoPush === undefined
              ? undefined
              : readBoolean(String(opts.autoPush), "--auto-push"),
          notifyTakeover:
            opts.notifyTakeover === undefined
              ? undefined
              : readBoolean(String(opts.notifyTakeover), "--notify-takeover")
        });
        requireAll(
          body,
          [
            { field: "allowProposals", flag: "allow-proposals" },
            { field: "requireReview", flag: "require-review" },
            { field: "startPaused", flag: "start-paused" },
            { field: "autoPush", flag: "auto-push" },
            { field: "notifyTakeover", flag: "notify-takeover" }
          ],
          "This route replaces the whole policy, so every flag must be sent."
        );
        const policy = await client.roles.upsertSystemPolicy(
          roleId,
          asRequestBody<RoleSystemPolicyBody>(body)
        );

        printSuccess("System policy updated.", {
          allowProposals: policy.allowProposals,
          requireReview: policy.requireReview,
          startPaused: policy.startPaused,
          autoPush: policy.autoPush,
          notifyTakeover: policy.notifyTakeover
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── boards ────────────────────────────────────────────────────────────────
  //
  // A Role's boards are how its systems are ORGANISED. Everything the Role holds
  // lands in Ungrouped until something places it, so a Role built entirely from
  // the terminal read as one undifferentiated pile until these verbs existed.
  const BOARDS_ARE_A_CANVAS = `
  A BOARD CARRIES NO PERMISSION AND NO EXECUTION MEANING. Moving a card changes
  where it is DRAWN on the Overview screen and changes nothing about what the
  Role can reach or what runs. Use "nexus role attach"/"detach" for holdings and
  the permission-set verbs for authority.
  Needs role_boards:read to look and role_boards:write to change, plus the
  Role's own board.view / board.manage capability — a scope alone is not enough.`;

  const boards = role
    .command("boards")
    .description("List a Role's Overview lanes and where each card sits")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role boards "Support agent"
  $ nexus role boards "Support agent" --json

Notes:
  A CARD IN NO LANE IS THE UNGROUPED LANE, and comes back with boardId null
  rather than being left out — a card missing from this payload does not exist,
  which is a different fact from a card nobody has placed.
  PLACEMENT ONLY. No names, statuses or icons: read those with "nexus role
  systems" and join on the id.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.listBoards(await resolveRoleId(client, ref));

        if (isJsonMode()) {
          printRecord(view);
          return;
        }

        printList(view.boards, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 24 },
          { key: "accent", label: "ACCENT", width: 18 },
          { key: "position", label: "POS", width: 4 }
        ]);
        printList(view.cards, undefined, [
          { key: "cardType", label: "KIND", width: 18 },
          { key: "cardId", label: "CARD", width: 36 },
          {
            key: "boardId",
            label: "LANE",
            width: 36,
            format: (v) => (v === null ? "Ungrouped" : String(v))
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const addBoard = role
    .command("add-board")
    .description("Append a lane to a Role's Overview")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--name <name>", "The lane's name")
    .addOption(
      enumOption(
        "--accent <accent>",
        "A palette token; the server picks one when omitted",
        ROLES_CREATE_BOARD__BODY_ACCENT
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-board "Support agent" --name "Automation"
  $ nexus role add-board "Support agent" --name "Billing" --accent teal

Notes:
  APPENDED, ALWAYS. There is no --position: ordering is asserted over the whole
  list by "nexus role reorder-boards", and a create that named its own position
  would be a second way to order that cannot renumber its neighbours.
  --accent IS A PALETTE TOKEN, not a CSS colour: slate, indigo, violet, sky,
  teal, emerald, amber, rose, surface_base, surface_secondary, surface_contrast.
  Anything else is a 400.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const board = await client.roles.createBoard(await resolveRoleId(client, ref), {
          name: String(opts.name),
          ...(opts.accent === undefined ? {} : { accent: opts.accent as RoleBoardAccent })
        });

        printSuccess("Board created.", { id: board.id, name: board.name, accent: board.accent });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const reorderBoards = role
    .command("reorder-boards")
    .description("Set the order of every one of a Role's lanes")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--board-ids <ids>", "EVERY board id, comma-separated, in the order you want")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role reorder-boards "Support agent" --board-ids 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13,7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44

Notes:
  THE LIST IS AN ASSERTION ABOUT ALL OF THEM, so send every board id, not the
  ones you moved. A set that is not exactly the Role's current boards is a 409:
  refetch with "nexus role boards" and retry. That refusal is the point — silently
  renumbering a stale list would leave a board somebody else just created at a
  position nobody chose, and report success.
  A REPEATED ID IS A 400, not a 409, because no refetch fixes it.
  Whitespace around the commas is trimmed and empty entries are dropped.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const view = await client.roles.reorderBoards(await resolveRoleId(client, ref), {
          boardIds: parseIdList(String(opts.boardIds))
        });

        printSuccess("Boards reordered.", { boards: view.boards.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const updateBoard = role
    .command("update-board")
    .description("Rename a lane, recolour it, or both")
    .argument("<role>", "Role name or UUID")
    .argument("<board-id>", "Board UUID")
    .option("--name <name>", "New name")
    .addOption(
      enumOption("--accent <accent>", "New palette token", ROLES_UPDATE_BOARD__BODY_ACCENT)
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --name "Automation"
  $ nexus role update-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --accent rose

Notes:
  BOTH FLAGS ARE OPTIONAL and sending neither is a no-op rather than an error —
  this is a PATCH, so it changes what you named and leaves the rest.
  --accent takes the same palette tokens "add-board" lists.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, boardId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const board = await client.roles.updateBoard(await resolveRoleId(client, ref), boardId, {
          ...(opts.name === undefined ? {} : { name: String(opts.name) }),
          ...(opts.accent === undefined ? {} : { accent: opts.accent as RoleBoardAccent })
        });

        printSuccess("Board updated.", { id: board.id, name: board.name, accent: board.accent });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const removeBoard = role
    .command("remove-board")
    .description("Delete a lane; its cards fall back to Ungrouped")
    .argument("<role>", "Role name or UUID")
    .argument("<board-id>", "Board UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-board "Support agent" 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13

Notes:
  DELETES THE LANE, NEVER THE CARDS. Every card on it moves to Ungrouped and
  nothing the Role holds is removed or stopped. cardsUnplaced counts how many
  moved, so an empty lane and a lane holding nine systems do not answer alike.
  THE PLACEMENTS ARE GONE THOUGH. Recreating the board does not put the cards
  back — that is "nexus role move-card", one card at a time.
  A card placed on it while the delete runs is a 409 and nothing changes.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, boardId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deleteBoard(await resolveRoleId(client, ref), boardId);

        printSuccess("Board deleted.", { cardsUnplaced: result.cardsUnplaced });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const moveCard = role
    .command("move-card")
    .description("Move one card into a lane, or out of every lane")
    .argument("<role>", "Role name or UUID")
    .addArgument(
      enumArgument(
        "<card-type>",
        "The kind of card — LOWERCASE, e.g. agent, workflow, collection",
        ROLES_MOVE_BOARD_CARD__PATH_VARS_CARD_TYPE
      )
    )
    .argument("<card-id>", "The card's own id")
    .option("--board-id <id>", "Destination lane")
    .option("--unplace", "Move it to Ungrouped instead")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role move-card "Support agent" agent 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 --board-id 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus role move-card "Support agent" agent 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 --unplace

Notes:
  EXACTLY ONE OF --board-id OR --unplace. Ungrouped is a real destination rather
  than a missing value, so there is no "send nothing to unplace it" — that would
  make a forgotten flag look like a deliberate move.
  <card-type> IS LOWERCASE, unlike the SCREAMING_CASE resource types everywhere
  else on this API: agent, workflow, deployment, ai_task, document_template,
  collection, workspace, external_tool. The Overview screen paints six more kinds
  that have nowhere to store a placement, and naming one is a 400 rather than a
  success for a move that did not persist.
  <card-id> is a UUID for most kinds but NOT all — a legacy owned-resource id may
  be any string, so this command does not check its shape.
${BOARDS_ARE_A_CANVAS}`
    )
    .action(async (ref: string, cardType: string, cardId: string, opts) => {
      try {
        const boardId = opts.boardId === undefined ? undefined : String(opts.boardId);
        const unplace = opts.unplace === true;
        if (boardId === undefined && !unplace) {
          throw new Error("Send --board-id <id>, or --unplace to move it to Ungrouped");
        }
        if (boardId !== undefined && unplace) {
          throw new Error("--board-id and --unplace ask for different destinations; send one");
        }

        const client = createClient(program.optsWithGlobals());
        const card = await client.roles.moveBoardCard(
          await resolveRoleId(client, ref),
          cardType as RoleBoardCardType,
          cardId,
          { boardId: unplace ? null : (boardId as string) }
        );

        printSuccess("Card moved.", {
          cardType: card.cardType,
          cardId: card.cardId,
          boardId: card.boardId ?? absent("Ungrouped")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  //
  // `create-job-type` and `update-job-type` take the WHOLE job type as one JSON
  // document and expose no field flags at all — 15 required fields including a
  // `parts[]` array and three expression strings. Both enums are body-only by
  // that design rather than by omission.
  const JOB_TYPE_IS_ONE_DOCUMENT =
    "the whole job type is supplied as one JSON document through --body; this command has no field flags";

  const JOB_TYPE_BODY_ONLY = {
    "Body.basis": JOB_TYPE_IS_ONE_DOCUMENT,
    "Body.group": JOB_TYPE_IS_ONE_DOCUMENT
  };

  bindCommand(accessRequests, ROLES_LIST_ACCESS_REQUESTS_CONTRACT);
  bindCommand(attach, ROLES_ATTACH_RESOURCE_CONTRACT);
  bindCommand(detach, ROLES_DETACH_RESOURCE_CONTRACT);
  bindCommand(addMember, ROLES_UPSERT_MEMBER_CONTRACT);
  bindCommand(createPermSet, ROLES_CREATE_PERMISSION_SET_CONTRACT);
  bindCommand(updatePermSet, ROLES_UPDATE_PERMISSION_SET_CONTRACT);
  bindCommand(requestAccess, ROLE_ACCESS_REQUESTS_CREATE_CONTRACT);
  bindCommand(reviewAccess, ROLE_ACCESS_REQUESTS_REVIEW_CONTRACT);
  bindCommand(creationRequests, ROLE_CREATION_REQUESTS_LIST_CONTRACT);
  bindCommand(reviewCreation, ROLE_CREATION_REQUESTS_REVIEW_CONTRACT);
  bindCommand(deletionRequests, ROLE_DELETION_REQUESTS_LIST_CONTRACT);
  bindCommand(reviewDeletion, ROLE_DELETION_REQUESTS_REVIEW_CONTRACT);
  bindCommand(boards, ROLES_LIST_BOARDS_CONTRACT);
  bindCommand(addBoard, ROLES_CREATE_BOARD_CONTRACT);
  bindCommand(reorderBoards, ROLES_REORDER_BOARDS_CONTRACT);
  bindCommand(updateBoard, ROLES_UPDATE_BOARD_CONTRACT);
  bindCommand(removeBoard, ROLES_DELETE_BOARD_CONTRACT);
  bindCommand(moveCard, ROLES_MOVE_BOARD_CARD_CONTRACT);
  bindCommand(createJobType, ROLE_JOB_TYPES_CREATE_CONTRACT, JOB_TYPE_BODY_ONLY);
  bindCommand(updateJobType, ROLE_JOB_TYPES_UPDATE_CONTRACT, JOB_TYPE_BODY_ONLY);
}

/**
 * Narrow `--status` locally rather than forwarding it.
 *
 * Forwarded verbatim a typo 400s on a query parameter, which reads as a server
 * problem. The three values are also upper-case on the wire and nobody types
 * them that way, so the input is folded first.
 */
function readAccessRequestStatus(
  raw: string | undefined
): "PENDING" | "APPROVED" | "REJECTED" | undefined {
  if (raw === undefined) return undefined;
  const upper = raw.toUpperCase();
  if (upper === "PENDING" || upper === "APPROVED" || upper === "REJECTED") return upper;
  throw new Error(`Invalid --status "${raw}". Expected PENDING, APPROVED or REJECTED.`);
}

/**
 * Resolve `--owner` into what the API expects.
 *
 * `undefined` means "leave ownership alone" and `null` means "clear it", and the
 * two cannot both be expressed by leaving the flag off — so `none` is a token
 * this CLI invents for the second. `none` is not a valid Clerk user id, so it
 * cannot collide with a real one.
 */
function readOwner(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === "none" || raw === "null") return null;
  return raw;
}

/**
 * Report a create or a delete that governance may have turned into a request.
 *
 * 🚨 THE DISCRIMINANT IS THE WHOLE POINT. Both routes answer 2xx either way, so
 * printing "created" off the HTTP status would report a Role that does not exist
 * — and printing "deleted" would report one that is still serving traffic. The
 * pending arm is a WARNING rather than a success line, because the caller has to
 * do something about it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `status` IS ON THE PAYLOAD, NOT JUST IN THE PROSE. THAT IS NEX-3627.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The SDK type says *"READ `status`. NEVER THE HTTP CODE"* and the human output
 * obeyed it — but `--json` carried `{success, id, name}` and `{success, note}`,
 * neither of which holds the discriminant, so the one instruction the contract
 * gives could not be followed on the CLI. A scripted caller reading `success`
 * could not tell "Role created" from "request filed", and on the delete side a
 * pending result reported success while the Role kept serving traffic.
 *
 * `success: true` is honest on all three arms — the call was accepted — so it is
 * `status` that has to be the branch, and it is now the same word on both
 * channels: `created`, `deleted`, `pending`.
 */
function reportGovernedWrite(result: CreateRoleResult | DeleteRoleResult): void {
  if (result.status === "created") {
    printSuccess("Role created.", {
      status: result.status,
      id: result.role.id,
      name: result.role.name
    });
    return;
  }
  if (result.status === "deleted") {
    printSuccess("Role deleted.", {
      status: result.status,
      note: "Its systems are now orphans — they still exist and still run, in no Role."
    });
    return;
  }

  printSuccess("Request filed for approval.", {
    status: result.status,
    requestId: result.request.id
  });
  printWarning(
    "NOTHING HAPPENED YET. This organization requires approval for that action.",
    `A request (${result.request.id}) is waiting on an admin.`,
    "The Role was not created, or not deleted — do not treat this as done."
  );
}
