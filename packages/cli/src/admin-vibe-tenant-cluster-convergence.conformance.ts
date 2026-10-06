/**
 * THE DRIFT GATE for the FORCE-CONVERGE and COMPLETE-TEARDOWN outcomes declared
 * in `admin-vibe-tenant-cluster-wire-types.ts`.
 *
 * The provision and disable half is gated by that module's own
 * `.conformance.ts`; the four together run past the size cap.
 *
 * Split out of `admin-wire-types.conformance.ts`, one gate per admin surface.
 *
 * `Data` is re-declared here rather than shared. That is the same trade that
 * file's own header makes for the operators — "the duplication is cheaper than
 * the coupling" — and here it is also FORCED: `wire-types-bundle.test.ts`
 * requires every `.conformance.ts` to import `@nexus/types`, so a module that
 * took `Data` from a shared vocabulary would carry that import unused, which
 * `unused-imports/no-unused-imports` reports and this package has no warning
 * budget for.
 */

import type { TApi } from "@nexus/types";

import type {
  VibeTenantClusterCompleteTeardownOutcome,
  VibeTenantClusterForceConvergeOutcome
} from "./admin-vibe-tenant-cluster-wire-types";
import type { VibeUnlistedVariant } from "./vibe-unlisted-variant";
import type { ListedArms, UnlistedArmAdmitted } from "./vibe-wire-vocabulary.conformance";
import {
  ARMS_AGREE,
  type ArmsAgree,
  type NoUnmodelledArm,
  type Wire
} from "./wire-conformance.types";

/** The response body of an admin endpoint, unwrapped from its envelope. */
type Data<Domain extends keyof TApi, Op extends keyof TApi[Domain]> = Wire<
  TApi[Domain][Op] extends { Response: infer R } ? (R extends { data: infer D } ? D : R) : never
>;

type WireForceConverge = Data<"AdminVibeTenantCluster", "ForceConverge">;

const _forceConvergeForced: ArmsAgree<
  "VibeTenantClusterForceConvergeOutcome.forced",
  VibeTenantClusterForceConvergeOutcome,
  WireForceConverge,
  "forced"
> = ARMS_AGREE;
const _forceConvergeAlreadyConverging: ArmsAgree<
  "VibeTenantClusterForceConvergeOutcome.already_converging",
  VibeTenantClusterForceConvergeOutcome,
  WireForceConverge,
  "already_converging"
> = ARMS_AGREE;
const _forceConvergeReconcilePaused: ArmsAgree<
  "VibeTenantClusterForceConvergeOutcome.reconcile_paused",
  VibeTenantClusterForceConvergeOutcome,
  WireForceConverge,
  "reconcile_paused"
> = ARMS_AGREE;
const _forceConvergeNotConverging: ArmsAgree<
  "VibeTenantClusterForceConvergeOutcome.not_converging",
  VibeTenantClusterForceConvergeOutcome,
  WireForceConverge,
  "not_converging"
> = ARMS_AGREE;
const _forceConvergeNotFound: ArmsAgree<
  "VibeTenantClusterForceConvergeOutcome.not_found",
  VibeTenantClusterForceConvergeOutcome,
  WireForceConverge,
  "not_found"
> = ARMS_AGREE;
// `NoUnmodelledArm` runs on the LISTED arms; the kind a newer backend adds is
// the unlisted arm, which the printer's `VibeUnlistedVariant<"kind">` must admit.
const _forceConvergeComplete: NoUnmodelledArm<
  "VibeTenantClusterForceConvergeOutcome",
  VibeTenantClusterForceConvergeOutcome,
  ListedArms<WireForceConverge, "kind">
> = true;
const _forceConvergeUnlisted: UnlistedArmAdmitted<
  "VibeTenantClusterForceConvergeOutcome",
  VibeUnlistedVariant<"kind">,
  WireForceConverge,
  "kind"
> = true;

type WireCompleteTeardown = Data<"AdminVibeTenantCluster", "CompleteTeardown">;

const _completeTeardownDestroyed: ArmsAgree<
  "VibeTenantClusterCompleteTeardownOutcome.destroyed",
  VibeTenantClusterCompleteTeardownOutcome,
  WireCompleteTeardown,
  "destroyed"
> = ARMS_AGREE;
const _completeTeardownAlreadyDestroyed: ArmsAgree<
  "VibeTenantClusterCompleteTeardownOutcome.already_destroyed",
  VibeTenantClusterCompleteTeardownOutcome,
  WireCompleteTeardown,
  "already_destroyed"
> = ARMS_AGREE;
const _completeTeardownNotDestroying: ArmsAgree<
  "VibeTenantClusterCompleteTeardownOutcome.not_destroying",
  VibeTenantClusterCompleteTeardownOutcome,
  WireCompleteTeardown,
  "not_destroying"
> = ARMS_AGREE;
const _completeTeardownNotFound: ArmsAgree<
  "VibeTenantClusterCompleteTeardownOutcome.not_found",
  VibeTenantClusterCompleteTeardownOutcome,
  WireCompleteTeardown,
  "not_found"
> = ARMS_AGREE;
const _completeTeardownComplete: NoUnmodelledArm<
  "VibeTenantClusterCompleteTeardownOutcome",
  VibeTenantClusterCompleteTeardownOutcome,
  ListedArms<WireCompleteTeardown, "kind">
> = true;
const _completeTeardownUnlisted: UnlistedArmAdmitted<
  "VibeTenantClusterCompleteTeardownOutcome",
  VibeUnlistedVariant<"kind">,
  WireCompleteTeardown,
  "kind"
> = true;
// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export {
  _completeTeardownAlreadyDestroyed,
  _completeTeardownComplete,
  _completeTeardownDestroyed,
  _completeTeardownNotDestroying,
  _completeTeardownNotFound,
  _completeTeardownUnlisted,
  _forceConvergeAlreadyConverging,
  _forceConvergeComplete,
  _forceConvergeForced,
  _forceConvergeNotConverging,
  _forceConvergeNotFound,
  _forceConvergeReconcilePaused,
  _forceConvergeUnlisted
};
