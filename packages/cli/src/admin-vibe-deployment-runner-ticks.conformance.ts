/**
 * THE DRIFT GATE for the DEPLOYMENT runner's tick union in `admin-wire-types.ts`.
 * The build runner's twin is `admin-vibe-runner-ticks.conformance.ts`.
 *
 * Its own module, with no `-wire-types.ts` sibling of its own: the unions stay in
 * `admin-wire-types.ts` (nothing that imports them moves), while their arm-by-arm
 * comparison would put that file's gate over the size cap on its own — and the
 * two together put ONE gate over it once the build union grew its
 * `region_at_capacity` arm, so each runner has its own.
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

import type { AdminVibeDeploymentRunnerTickResponse } from "./admin-wire-types";
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
// Deployment runner tick
//
// A DISCRIMINATED UNION, so it is compared arm by arm with `ArmsAgree` rather
// than as a field set, and closed with `NoUnmodelledArm`.
// `wire-conformance.types.ts` carries why each of those is shaped as it is.
// ============================================================

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

/**
 * The LISTED half carries no kind the CLI has not modelled. Run against the
 * listed arms only: the unlisted arm's kind is the brand, which every listed
 * literal would otherwise be measured against.
 */
const _deployTickComplete: NoUnmodelledArm<
  "AdminVibeDeploymentRunnerTickResponse",
  AdminVibeDeploymentRunnerTickResponse,
  ListedArms<WireDeployTick, "kind">
> = true;

/**
 * A kind a newer backend added: the contract reads it as the server's word with
 * every field it sent, and the printer's `VibeUnlistedVariant<"kind">` must admit it.
 */
const _deployTickUnlisted: UnlistedArmAdmitted<
  "AdminVibeDeploymentRunnerTickResponse",
  VibeUnlistedVariant<"kind">,
  WireDeployTick,
  "kind"
> = true;
// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export {
  _deployTickCompensated,
  _deployTickComplete,
  _deployTickDispatched,
  _deployTickDisplaced,
  _deployTickIdle,
  _deployTickTimedOut,
  _deployTickUnlisted
};
