/**
 * THE DRIFT GATE for `admin-wire-types.ts`.
 *
 * The CLI publishes standalone, so `@nexus/types` cannot be a runtime
 * dependency and the Vibe ADMIN wire shapes are hand-declared — the same
 * constraint, and the same exposure, that `vibe-wire-types.conformance.ts`
 * closes for the tenant surface. Until this file existed the only thing asking
 * for lockstep was a comment saying so, and TWO shapes had drifted past it:
 *
 *   · `AdminVibeBuildJobResponse.builder` was `"NIXPACKS" | "DOCKERFILE"`; the
 *     contract is NULLABLE, because the build strategy is reported with the
 *     job's terminal outcome. `vibe-build-job claim` returns a RUNNING row, so
 *     the CLI declared a string on the one response that is reliably null.
 *   · `AdminVibeDeploymentResponse` had no `versionNumber` — the user-facing
 *     `v{n}`. The contract's own comment says an admin sees both it and the
 *     internal blue/green `color`; the admin CLI could show only the slot.
 *
 * Neither broke a command, which is the point. An unmodelled key is not printed
 * and a wrongly-non-null one renders as `null`, so both read as "the server did
 * not send it" rather than as a stale copy.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * Every assertion is a `const` whose declared type is `true` when the shapes
 * agree and a descriptive TUPLE when they do not, so `pnpm typecheck` prints
 * the offending field names rather than `'false' is not assignable to 'true'`.
 * There is no runtime behaviour here; the module exists to be compiled.
 *
 * The comparison target is `TApi[…]["Response"]` — the ENDPOINT contract, not
 * the entity schema behind it. A response is what the CLI actually receives, so
 * a field that exists on an entity but never leaves the server cannot produce a
 * false failure.
 *
 * The operators are deliberately NOT shared with `vibe-wire-types.conformance`.
 * That file is not importable without dragging its own fifty shapes into this
 * compilation, and a `Mirrors` that two gates share is a `Mirrors` that neither
 * can change. They are twelve lines; the duplication is cheaper than the
 * coupling, and each file's copy is checked by its own assertions.
 *
 * ── Why this file cannot reach the published binary ─────────────────────────
 *
 * `src/index.ts` cannot reach this module, so tsup's bundle graph never visits
 * it and the `@nexus/types` import below stays out of `dist/`.
 * `vibe-wire-types.test.ts` holds that as an assertion over EVERY module the
 * binary can reach, so it covers this file too without being told about it.
 */

import type { TApi } from "@nexus/types";

import type {
  AdminVibeBuildJobResponse,
  AdminVibeBuildRunnerTickResponse,
  AdminVibeDeploymentResponse,
  AdminVibeDeploymentRunnerTickResponse,
  ListVibeOrgCostSafetyStatesResponse,
  VibeOrgConsumptionCapResponse,
  VibeOrgCostSafetyStateListItem,
  VibeOrgCostSafetyStateResponse,
  VibeTenantClusterDisableOutcome,
  VibeTenantClusterProvisionOutcome
} from "./admin-wire-types";

/**
 * `z.infer` is POST-parse, so a `z.string().datetime()` is `string` already and
 * a `z.date()` would be `Date`. The CLI reads raw JSON and never parses, so
 * every date reaches it as a string. Normalising here rather than declaring
 * `Date` in the wire types keeps the declarations honest about what arrives.
 */
type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** The response body of an admin endpoint, unwrapped from its envelope. */
type Data<Domain extends keyof TApi, Op extends keyof TApi[Domain]> = Wire<
  TApi[Domain][Op] extends { Response: infer R } ? (R extends { data: infer D } ? D : R) : never
>;

/** Wire fields the CLI type does not declare. */
type Omitted<Cli, W> = Exclude<keyof W, keyof Cli>;

/**
 * A CLI field with no counterpart on the wire — ALWAYS a defect, never a
 * deliberate choice: the CLI cannot receive a key the server does not send, so
 * anything here was renamed or removed upstream and now reads as `undefined`.
 */
type NoInventedFields<Label extends string, Cli, W> = [Exclude<keyof Cli, keyof W>] extends [never]
  ? true
  : [Label, "declares a field the wire contract does not have:", Exclude<keyof Cli, keyof W>];

/**
 * The CLI omits EXACTLY the wire fields named in `Declared`, no more and no
 * fewer. Both directions: a NEW wire field the CLI ignores fails until someone
 * mirrors it or writes its name here with a reason, and a declared omission
 * that no longer exists fails too, so the list cannot rot into names nobody can
 * explain.
 */
type OmitsExactly<Label extends string, Cli, W, Declared> = [
  Exclude<Omitted<Cli, W>, Declared>
] extends [never]
  ? [Exclude<Declared, Omitted<Cli, W>>] extends [never]
    ? true
    : [Label, "declares an omission that is not missing:", Exclude<Declared, Omitted<Cli, W>>]
  : [Label, "silently omits a wire field:", Exclude<Omitted<Cli, W>, Declared>];

/**
 * Every shared field carries a type the wire value satisfies. Assignability
 * rather than equality, in that direction on purpose: the CLI may hold a field
 * more LOOSELY than the contract (a published binary must not reject a value a
 * newer backend adds). It may never hold one more tightly — that is the shape
 * that reads a real response as the wrong type, and it is exactly how
 * `builder` went wrong.
 */
type SharedFieldsMatch<Label extends string, Cli, W> =
  Pick<W, Extract<keyof Cli, keyof W>> extends Pick<Cli, Extract<keyof Cli, keyof W>>
    ? true
    : [Label, "narrows or mistypes a field it shares with the wire contract"];

/**
 * The three assertions every mirrored shape gets. `readonly`, because
 * {@link AGREES} is an `as const` tuple and a readonly tuple is not assignable
 * to a mutable one — without this every assertion fails for a reason unrelated
 * to the shapes it checks.
 */
type Mirrors<Label extends string, Cli, W, Declared = never> = readonly [
  NoInventedFields<Label, Cli, W>,
  OmitsExactly<Label, Cli, W, Declared>,
  SharedFieldsMatch<Label, Cli, W>
];

/** Satisfied by a `Mirrors<…>` tuple only when all three members are `true`. */
const AGREES = [true, true, true] as const;

// ============================================================
// Cost safety
// ============================================================

type WireCostSafetyState = Data<"AdminVibeCostSafety", "GetVibeOrgCostSafetyState">;
const _costSafetyState: Mirrors<
  "VibeOrgCostSafetyStateResponse",
  VibeOrgCostSafetyStateResponse,
  WireCostSafetyState
> = AGREES;

type WireCostSafetyList = Data<"AdminVibeCostSafety", "ListVibeOrgCostSafetyStates">;
const _costSafetyList: Mirrors<
  "ListVibeOrgCostSafetyStatesResponse",
  ListVibeOrgCostSafetyStatesResponse,
  WireCostSafetyList
> = AGREES;

type WireCostSafetyItem = WireCostSafetyList["items"][number];
const _costSafetyItem: Mirrors<
  "VibeOrgCostSafetyStateListItem",
  VibeOrgCostSafetyStateListItem,
  WireCostSafetyItem
> = AGREES;

// ============================================================
// Consumption caps
// ============================================================

type WireConsumptionCap = Data<"AdminVibeConsumptionCap", "GetVibeOrgConsumptionCap">;
const _consumptionCap: Mirrors<
  "VibeOrgConsumptionCapResponse",
  VibeOrgConsumptionCapResponse,
  WireConsumptionCap
> = AGREES;

// ============================================================
// Build jobs
//
// `Claim` is the operation compared on purpose: it is the transition that
// produces the RUNNING row whose `builder` is null, so it is the response that
// would have caught the drift this gate was written for.
// ============================================================

type WireBuildJob = Data<"AdminVibeBuildJob", "Claim">;
const _buildJob: Mirrors<"AdminVibeBuildJobResponse", AdminVibeBuildJobResponse, WireBuildJob> =
  AGREES;

// ============================================================
// Deployments
// ============================================================

type WireDeployment = Data<"AdminVibeDeployment", "MarkHealthy">;
const _deployment: Mirrors<
  "AdminVibeDeploymentResponse",
  AdminVibeDeploymentResponse,
  WireDeployment
> = AGREES;

// ============================================================
// Runner ticks
//
// Both are DISCRIMINATED UNIONS, so the field-set operators above would compare
// the union's common keys and prove almost nothing. They are compared arm by
// arm instead, keyed on `kind`.
//
// Every arm is also asserted INHABITED. `Extract<U, {kind: "x"}>` is silently
// `never` when the union does not carry that arm, and a `never` on both sides
// satisfies every structural assertion — so a missing arm would read as a
// perfect match. That trap is not hypothetical: it made an earlier version of
// the Vibe gate compare nothing at all.
// ============================================================

type Inhabited<Label extends string, T> = [T] extends [never]
  ? [Label, "resolves to never — the arm does not exist on one side"]
  : true;

type Arm<U, K extends string> = Extract<U, { kind: K }>;

type ArmsAgree<Label extends string, Cli, W, K extends string> = readonly [
  Inhabited<Label, Arm<Cli, K>>,
  Inhabited<Label, Arm<W, K>>,
  NoInventedFields<Label, Arm<Cli, K>, Arm<W, K>>,
  OmitsExactly<Label, Arm<Cli, K>, Arm<W, K>, never>,
  SharedFieldsMatch<Label, Arm<Cli, K>, Arm<W, K>>
];

const ARMS_AGREE = [true, true, true, true, true] as const;

type WireBuildTick = Data<"AdminVibeBuildRunner", "Tick">;

const _buildTickIdle: ArmsAgree<
  "AdminVibeBuildRunnerTickResponse.idle",
  AdminVibeBuildRunnerTickResponse,
  WireBuildTick,
  "idle"
> = ARMS_AGREE;
const _buildTickDispatched: ArmsAgree<
  "AdminVibeBuildRunnerTickResponse.dispatched",
  AdminVibeBuildRunnerTickResponse,
  WireBuildTick,
  "dispatched"
> = ARMS_AGREE;
const _buildTickRaceLost: ArmsAgree<
  "AdminVibeBuildRunnerTickResponse.race_lost",
  AdminVibeBuildRunnerTickResponse,
  WireBuildTick,
  "race_lost"
> = ARMS_AGREE;
const _buildTickCompensated: ArmsAgree<
  "AdminVibeBuildRunnerTickResponse.dispatch_failed_compensated",
  AdminVibeBuildRunnerTickResponse,
  WireBuildTick,
  "dispatch_failed_compensated"
> = ARMS_AGREE;

/**
 * The union carries no arm the CLI has not modelled. The per-arm assertions
 * above cannot see a NEW `kind` — they only compare the arms they name — so
 * this is the one that fails when the backend grows a variant.
 */
type NoUnmodelledArm<
  Label extends string,
  Cli extends { kind: string },
  W extends { kind: string }
> = [Exclude<W["kind"], Cli["kind"]>] extends [never]
  ? true
  : [
      Label,
      "the wire union carries a kind the CLI does not model:",
      Exclude<W["kind"], Cli["kind"]>
    ];

const _buildTickComplete: NoUnmodelledArm<
  "AdminVibeBuildRunnerTickResponse",
  AdminVibeBuildRunnerTickResponse,
  WireBuildTick
> = true;

type WireDeployTick = Data<"AdminVibeDeploymentRunner", "Tick">;

const _deployTickIdle: ArmsAgree<
  "AdminVibeDeploymentRunnerTickResponse.idle",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick,
  "idle"
> = ARMS_AGREE;
const _deployTickDispatched: ArmsAgree<
  "AdminVibeDeploymentRunnerTickResponse.dispatched",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick,
  "dispatched"
> = ARMS_AGREE;
const _deployTickCompensated: ArmsAgree<
  "AdminVibeDeploymentRunnerTickResponse.dispatch_failed_compensated",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick,
  "dispatch_failed_compensated"
> = ARMS_AGREE;
const _deployTickTimedOut: ArmsAgree<
  "AdminVibeDeploymentRunnerTickResponse.timed_out",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick,
  "timed_out"
> = ARMS_AGREE;
const _deployTickDisplaced: ArmsAgree<
  "AdminVibeDeploymentRunnerTickResponse.displaced",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick,
  "displaced"
> = ARMS_AGREE;

const _deployTickComplete: NoUnmodelledArm<
  "AdminVibeDeploymentRunnerTickResponse",
  AdminVibeDeploymentRunnerTickResponse,
  WireDeployTick
> = true;

// ============================================================
// Tenant cluster
//
// These two moved into `admin-wire-types.ts` with the rest and were, for one
// commit, imported by nothing here — which left them exactly where they started:
// comment-only lockstep, in the module whose whole purpose is that no shape is
// left in that state. Moving a declaration next to a gate is not gating it.
// ============================================================

type WireProvision = Data<"AdminVibeTenantCluster", "Provision">;

const _provisionProvisioning: ArmsAgree<
  "VibeTenantClusterProvisionOutcome.provisioning",
  VibeTenantClusterProvisionOutcome,
  WireProvision,
  "provisioning"
> = ARMS_AGREE;
const _provisionAlreadyActive: ArmsAgree<
  "VibeTenantClusterProvisionOutcome.already_active",
  VibeTenantClusterProvisionOutcome,
  WireProvision,
  "already_active"
> = ARMS_AGREE;
const _provisionComplete: NoUnmodelledArm<
  "VibeTenantClusterProvisionOutcome",
  VibeTenantClusterProvisionOutcome,
  WireProvision
> = true;

type WireDisable = Data<"AdminVibeTenantCluster", "Disable">;

const _disableRetained: ArmsAgree<
  "VibeTenantClusterDisableOutcome.retained",
  VibeTenantClusterDisableOutcome,
  WireDisable,
  "retained"
> = ARMS_AGREE;
const _disableAlreadyRetained: ArmsAgree<
  "VibeTenantClusterDisableOutcome.already_retained",
  VibeTenantClusterDisableOutcome,
  WireDisable,
  "already_retained"
> = ARMS_AGREE;
const _disableNotFound: ArmsAgree<
  "VibeTenantClusterDisableOutcome.not_found",
  VibeTenantClusterDisableOutcome,
  WireDisable,
  "not_found"
> = ARMS_AGREE;
const _disableNotDisablable: ArmsAgree<
  "VibeTenantClusterDisableOutcome.not_disablable",
  VibeTenantClusterDisableOutcome,
  WireDisable,
  "not_disablable"
> = ARMS_AGREE;
const _disableComplete: NoUnmodelledArm<
  "VibeTenantClusterDisableOutcome",
  VibeTenantClusterDisableOutcome,
  WireDisable
> = true;

// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export {
  _buildJob,
  _buildTickCompensated,
  _buildTickComplete,
  _buildTickDispatched,
  _buildTickIdle,
  _buildTickRaceLost,
  _consumptionCap,
  _costSafetyItem,
  _costSafetyList,
  _costSafetyState,
  _deployment,
  _deployTickCompensated,
  _deployTickComplete,
  _deployTickDispatched,
  _deployTickDisplaced,
  _deployTickIdle,
  _deployTickTimedOut,
  _disableAlreadyRetained,
  _disableComplete,
  _disableNotDisablable,
  _disableNotFound,
  _disableRetained,
  _provisionAlreadyActive,
  _provisionComplete,
  _provisionProvisioning
};
