/**
 * The TENANT-CLUSTER outcome unions an operator-triggered provision, disable,
 * force-converge or complete-teardown answers with.
 *
 * Every one is DISCRIMINATED: the CLI must render the arm it was handed, so an
 * unmodelled arm is a silent no-op rather than an error, which is what the
 * conformance module's `NoUnmodelledArm` closes.
 *
 * Split out of `admin-wire-types.ts` — one module per admin surface, the same
 * shape the Vibe tenant gates already use. Hand-declared for the reason that
 * file gives: the CLI publishes standalone, so `@nexus/types` cannot be a
 * runtime dependency. Nothing about the shapes changed in the move, and the
 * conformance module beside this one is what fails `pnpm typecheck` when one
 * stops matching its `ZAdminVibe*` contract.
 */

import type { VibeTenantClusterStatus } from "./vibe-regions";

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
