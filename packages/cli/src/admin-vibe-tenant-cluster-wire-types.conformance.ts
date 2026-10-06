/**
 * THE DRIFT GATE for `admin-vibe-tenant-cluster-wire-types.ts` — the PROVISION
 * and DISABLE outcomes.
 *
 * Force-converge and complete-teardown are gated in
 * `admin-vibe-tenant-cluster-convergence.conformance.ts`; the four together run
 * past the size cap.
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
  VibeTenantClusterDisableOutcome,
  VibeTenantClusterProvisionOutcome
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
// `NoUnmodelledArm` runs on the LISTED arms; the kind a newer backend adds is
// the unlisted arm, which the printer's `VibeUnlistedVariant<"kind">` must admit.
const _provisionComplete: NoUnmodelledArm<
  "VibeTenantClusterProvisionOutcome",
  VibeTenantClusterProvisionOutcome,
  ListedArms<WireProvision, "kind">
> = true;
const _provisionUnlisted: UnlistedArmAdmitted<
  "VibeTenantClusterProvisionOutcome",
  VibeUnlistedVariant<"kind">,
  WireProvision,
  "kind"
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
  ListedArms<WireDisable, "kind">
> = true;
const _disableUnlisted: UnlistedArmAdmitted<
  "VibeTenantClusterDisableOutcome",
  VibeUnlistedVariant<"kind">,
  WireDisable,
  "kind"
> = true;
// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export {
  _disableAlreadyRetained,
  _disableComplete,
  _disableNotDisablable,
  _disableNotFound,
  _disableRetained,
  _disableUnlisted,
  _provisionAlreadyActive,
  _provisionComplete,
  _provisionProvisioning,
  _provisionUnlisted
};
