/**
 * THE DRIFT GATE for the SERVER-ROLL REQUEST outcome declared in
 * `admin-vibe-tenant-cluster-server-roll-wire-types.ts`, against
 * `TApi["AdminVibeTenantCluster"]["RequestServerRoll"]`.
 *
 * `Data` is re-declared here rather than shared, for the reason
 * `admin-vibe-tenant-cluster-convergence.conformance.ts` gives: every
 * `.conformance.ts` must import `@nexus/types`, and a shared `Data` would leave
 * that import unused.
 */

import type { TApi } from "@nexus/types";

import type { VibeTenantClusterRequestServerRollOutcome } from "./admin-vibe-tenant-cluster-server-roll-wire-types";
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

type WireRequestServerRoll = Data<"AdminVibeTenantCluster", "RequestServerRoll">;

const _requestServerRollRequested: ArmsAgree<
  "VibeTenantClusterRequestServerRollOutcome.requested",
  VibeTenantClusterRequestServerRollOutcome,
  WireRequestServerRoll,
  "requested"
> = ARMS_AGREE;
const _requestServerRollAlreadyPending: ArmsAgree<
  "VibeTenantClusterRequestServerRollOutcome.already_pending",
  VibeTenantClusterRequestServerRollOutcome,
  WireRequestServerRoll,
  "already_pending"
> = ARMS_AGREE;
const _requestServerRollReconcilePaused: ArmsAgree<
  "VibeTenantClusterRequestServerRollOutcome.reconcile_paused",
  VibeTenantClusterRequestServerRollOutcome,
  WireRequestServerRoll,
  "reconcile_paused"
> = ARMS_AGREE;
const _requestServerRollNotSettled: ArmsAgree<
  "VibeTenantClusterRequestServerRollOutcome.not_settled",
  VibeTenantClusterRequestServerRollOutcome,
  WireRequestServerRoll,
  "not_settled"
> = ARMS_AGREE;
const _requestServerRollNotFound: ArmsAgree<
  "VibeTenantClusterRequestServerRollOutcome.not_found",
  VibeTenantClusterRequestServerRollOutcome,
  WireRequestServerRoll,
  "not_found"
> = ARMS_AGREE;
// `NoUnmodelledArm` runs on the LISTED arms; the kind a newer backend adds is
// the unlisted arm, which the printer's `VibeUnlistedVariant<"kind">` must admit.
const _requestServerRollComplete: NoUnmodelledArm<
  "VibeTenantClusterRequestServerRollOutcome",
  VibeTenantClusterRequestServerRollOutcome,
  ListedArms<WireRequestServerRoll, "kind">
> = true;
const _requestServerRollUnlisted: UnlistedArmAdmitted<
  "VibeTenantClusterRequestServerRollOutcome",
  VibeUnlistedVariant<"kind">,
  WireRequestServerRoll,
  "kind"
> = true;

// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export {
  _requestServerRollAlreadyPending,
  _requestServerRollComplete,
  _requestServerRollNotFound,
  _requestServerRollNotSettled,
  _requestServerRollReconcilePaused,
  _requestServerRollRequested,
  _requestServerRollUnlisted
};
