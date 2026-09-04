/**
 * The wire shapes `admin.ts` receives from the Vibe admin endpoints.
 *
 * WHY THEY ARE HAND-DECLARED. The CLI publishes as a standalone npm package, so
 * `@nexus/types` cannot be a runtime dependency: it pulls Zod and, transitively,
 * the generated Prisma enums — the +5MB the type-only import rule exists to keep
 * out of a bundle. So these are copies of the `ZAdminVibe*` contracts under
 * `packages/types/src/api/domains/admin/`.
 *
 * WHY THEY LIVE HERE RATHER THAN IN `admin.ts`. A copy is safe only while
 * something FAILS when it stops matching the original. That something is
 * `admin-wire-types.conformance.ts`, and it can only compare shapes it can
 * import — so the declarations have to be exported from a module of their own.
 * The comment they used to carry ("keep these shapes in lockstep when the
 * backend evolves") was the only thing asking, and TWO had already drifted past
 * it:
 *
 *   · `AdminVibeBuildJobResponse.builder` was `"NIXPACKS" | "DOCKERFILE"`. The
 *     contract made it NULLABLE, with its own comment saying why: null while
 *     nobody has observed the build strategy — PENDING, RUNNING, or a timeout
 *     that never reported. `vibe-build-job claim` is the command that produces
 *     exactly that row, so the CLI declared a string on the one response that
 *     is reliably null.
 *   · `AdminVibeDeploymentResponse` had no `versionNumber`, the user-facing
 *     monotonic `v{n}`. The contract's comment says "`color` is the internal
 *     blue/green slot; admins see both" — and the admin CLI could not print it,
 *     because an unmodelled key is simply not there to print.
 *
 * Neither broke a command. That is the failure mode: a missing key renders as
 * nothing and a nullable one renders as `null`, so both read as "the server did
 * not send it" rather than as a stale copy.
 */

import type { VibeTenantClusterStatus } from "./vibe-regions";

/**
 * Tri-state PATCH value for a consumption-cap column. Distinguishes the three
 * semantically-different operator intents:
 *
 *   - flag omitted        → property absent from body → adapter leaves column untouched
 *   - flag value `"none"` → property present, value `null` → adapter clears the override
 *   - flag value integer  → property present, value number → adapter installs the override
 *
 * The whole reason this is wire-level visible (rather than just `number | null`
 * with `null = unchanged`) is that "do nothing" and "clear" both need
 * non-collapsing representations across the JSON boundary. See the backend's
 * SetVibeOrgConsumptionCapUseCase, which uses `in` (not `??`) to keep them
 * distinct.
 */
export type CapPatchValue = number | null;

/**
 * The cost-safety states — mirrors `$Enums.VibeOrgCostSafetyStatus`.
 *
 * Deliberately re-declared rather than imported from `@nexus/types`, which owns
 * the canonical list and bridges it straight off the generated Prisma enum
 * (`api/domains/admin/zadmin-vibe-cost-safety.ts`). Importing it would drag zod
 * and the generated Prisma enums into a CLI whose only runtime dependency is
 * `commander` — the same trade `vibe-regions.ts` documents. The backend's Zod
 * boundary rejects a bad status regardless: this copy fails before the HTTP
 * call and names the choices in `--help`, it does not enforce the policy.
 *
 * ONE copy, read by every verb in the cost-safety section. A second list is the
 * exact failure this must not repeat: `zadmin-vibe-cost-safety.ts` once
 * hand-kept `["OK","WARNING","SUSPENDED"]` under the SAME NAME as the generated
 * constant, so a fourth status would have moved with the schema everywhere
 * except at that one boundary, which would have kept rejecting it. Adding a
 * verb means reusing this constant, never retyping it.
 */
export const COST_SAFETY_STATUS_VALUES = ["OK", "WARNING", "SUSPENDED"] as const;
export type CostSafetyStatus = (typeof COST_SAFETY_STATUS_VALUES)[number];

export interface VibeOrgCostSafetyStateResponse {
  organizationId: string;
  status: CostSafetyStatus;
  suspendedReason: string | null;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VibeOrgConsumptionCapResponse {
  organizationId: string;
  /** Raw overrides — null = use platform default for this type. */
  computeMinCap: number | null;
  buildMinCap: number | null;
  egressMbCap: number | null;
  backupMinCap: number | null;
  /** Resolved effective caps (override ?? platform default). */
  effectiveComputeMinCap: number;
  effectiveBuildMinCap: number;
  effectiveEgressMbCap: number;
  effectiveBackupMinCap: number;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * One row of the fleet read.
 *
 * NOT the same shape as `VibeOrgCostSafetyStateResponse`: that one carries
 * `present` and nullable timestamps because it answers for an org that may have
 * no row at all. Every item here IS a row, so `present` would be a constant
 * `true` and the timestamps can never be null.
 *
 * `organizationName` is nullable on purpose — a cost-safety row can outlive its
 * organization, and the honest answer is `null` beside the raw id.
 *
 * Declared as a `type`, not an `interface`: only a type alias carries the
 * implicit index signature that `printTable`'s `Record<string, unknown>` row
 * parameter needs, so flipping this to an interface breaks the render call.
 */
export type VibeOrgCostSafetyStateListItem = {
  organizationId: string;
  organizationName: string | null;
  status: CostSafetyStatus;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface ListVibeOrgCostSafetyStatesResponse {
  items: VibeOrgCostSafetyStateListItem[];
  /**
   * Rows matching the `--status` filter, independent of the page. The number IS
   * the report: "1 suspended org" and "1 of 300" call for entirely different
   * responses, and a page cannot tell them apart.
   */
  total: number;
}

/** Discriminated outcome of an operator-triggered provision. */
export type VibeTenantClusterProvisionOutcome =
  | {
      kind: "provisioning";
      reprovisioned: boolean;
      /**
       * Present and true only when the operator re-fired a provision against a
       * row already PROVISIONING, so the request declared nothing. Absent on a
       * fresh create and on a reprovision.
       */
      reusedExistingRow?: boolean;
    }
  | { kind: "already_active"; status: VibeTenantClusterStatus };

/** Discriminated outcome of an operator-triggered disable. */
export type VibeTenantClusterDisableOutcome =
  | { kind: "retained"; retainUntil: string }
  | { kind: "already_retained" }
  | { kind: "not_found" }
  | { kind: "not_disablable"; status: VibeTenantClusterStatus };

/**
 * Discriminated outcome of an operator-triggered force-converge. Mirrors
 * `AdminVibeTenantClusterForceConvergeOutcomeSchema` in
 * `packages/types/src/api/domains/admin/zadmin-vibe-tenant-cluster.ts` — see
 * that file for what each variant means. `forced` is the only variant where a
 * converge will actually run: `already_converging` covers PROVISIONING /
 * UPDATING / DEGRADED, all of which the reconcile loop already retries every
 * tick, so this lever is a genuine no-op on a cluster already stuck DEGRADED.
 */
export type VibeTenantClusterForceConvergeOutcome =
  | { kind: "forced"; reason: string }
  | { kind: "already_converging"; status: VibeTenantClusterStatus }
  | { kind: "reconcile_paused"; status: VibeTenantClusterStatus; pausedReason: string | null }
  | { kind: "not_converging"; status: VibeTenantClusterStatus }
  | { kind: "not_found" };

/**
 * Discriminated outcome of an operator completing a wedged teardown. Mirrors
 * `AdminVibeTenantClusterCompleteTeardownOutcomeSchema` — only ever moves a
 * cluster already DESTROYING to DESTROYED; it never starts a teardown.
 */
export type VibeTenantClusterCompleteTeardownOutcome =
  | { kind: "destroyed"; confirmation: string }
  | { kind: "already_destroyed" }
  | { kind: "not_destroying"; status: VibeTenantClusterStatus }
  | { kind: "not_found" };

export interface AdminVibeBuildJobResponse {
  id: string;
  vibeDeploymentId: string;
  organizationId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  /**
   * NULLABLE, and the null is the common case rather than the edge one: the
   * build strategy is reported with the job's TERMINAL outcome, so every
   * PENDING or RUNNING row — including the one `vibe-build-job claim` returns —
   * carries null here.
   */
  builder: "NIXPACKS" | "DOCKERFILE" | "GENERATED" | null;
  logsRef: string;
  durationMs: number | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVibeDeploymentResponse {
  id: string;
  vibeAppId: string;
  organizationId: string;
  color: "BLUE" | "GREEN";
  /**
   * The user-facing monotonic version (`v{n}`). `color` is the internal
   * blue/green slot; an admin needs both, and asking one which deployment is
   * live gets a slot name rather than a version without this.
   */
  versionNumber: number;
  status:
    | "BUILDING"
    | "AWAITING_APPROVAL"
    | "DEPLOYING"
    | "HEALTHY"
    | "FAILED"
    | "ROLLED_BACK"
    | "SUPERSEDED"
    | "DISPLACED";
  triggerSha: string;
  imageRef: string;
  errorReason: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discriminated outcome. Mirrors `AdminVibeBuildRunnerTickOutcome` in the
 * @nexus/types schema + `DispatchNextVibeBuildJobOutcome` in the backend use
 * case. Exhaustiveness in `printTickRecord` is enforced via the never-narrowing
 * check — every new variant surfaces as a TS error at the formatter rather than
 * as a silent runtime branch.
 */
export type AdminVibeBuildRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; buildJobId: string }
  | { kind: "race_lost"; buildJobId: string }
  | {
      kind: "dispatch_failed_compensated";
      buildJobId: string;
      retryable: boolean;
      reason: string;
    };

/**
 * Discriminated outcome. Mirrors `AdminVibeDeploymentRunnerTickOutcome` in the
 * @nexus/types schema + `DispatchNextReadyVibeDeploymentOutcome` in the backend
 * use case. No `race_lost` variant — the deployer has no claim step (the row is
 * already DEPLOYING when picked up).
 */
export type AdminVibeDeploymentRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; deploymentId: string }
  | {
      kind: "dispatch_failed_compensated";
      deploymentId: string;
      retryable: boolean;
      reason: string;
    }
  | { kind: "timed_out"; deploymentId: string; ageMs: number }
  | { kind: "displaced"; deploymentId: string; displacedByDeploymentId: string };
