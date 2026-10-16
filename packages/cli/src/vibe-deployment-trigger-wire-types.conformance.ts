/**
 * THE DRIFT GATE for `vibe-deployment-trigger-wire-types.ts`.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 */

import type { TApi } from "@nexus/types";

import type { TriggerDeploymentResponse } from "./vibe-deployment-trigger-wire-types";
import type { VibeUnlistedVariant } from "./vibe-unlisted-variant";
import type {
  ListedArms,
  UnlistedArmAdmitted,
  VibeEnvelopedOp
} from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

/**
 * The trigger response is a union discriminated on `status`, and `keyof` a union yields
 * only the keys every arm shares — so each arm is asserted on its own or the check
 * degenerates to comparing `{ status }` with `{ status }`.
 *
 * The arms are split by EXCLUDING the confirmation arm rather than by extracting the
 * success one. `Extract<…, { status: "created" }>` looks like the obvious way and
 * silently yields `never`: the CLI models created and reused as ONE arm typed
 * `status: "created" | "reused"`, and that union is not assignable to the single literal.
 * A `never` on both sides then satisfies every assertion in `Mirrors` — the check would
 * pass while comparing nothing, which is the failure mode this whole file exists to end.
 * The wire keeps them as two arms; both carry identical keys, so `keyof` over the pair is
 * the same set either way. Both run on the LISTED arms; `_triggerUnlisted` covers the rest.
 */
type WireTrigger = ListedArms<VibeData<"TriggerDeployment">, "status">;
type ConfirmationArm = { status: "confirmation_required" };

const _triggerSuccess: Mirrors<
  "TriggerDeploymentResponse (created | reused)",
  Exclude<TriggerDeploymentResponse, ConfirmationArm>,
  Exclude<WireTrigger, ConfirmationArm>
> = AGREES;

const _triggerConfirmation: Mirrors<
  "TriggerDeploymentResponse (confirmation_required)",
  Extract<TriggerDeploymentResponse, ConfirmationArm>,
  Extract<WireTrigger, ConfirmationArm>
> = AGREES;

/**
 * Both arms are non-empty. Guards the split itself: every assertion above is vacuously
 * satisfied if `Exclude`/`Extract` returns `never`, and that is precisely what the
 * obvious spelling of this split does.
 */
const _triggerArmsNonEmpty: [
  [Exclude<TriggerDeploymentResponse, ConfirmationArm>] extends [never]
    ? ["the CLI trigger union has no success arm — the split above checks nothing"]
    : true,
  [Extract<WireTrigger, ConfirmationArm>] extends [never]
    ? ["the wire trigger union has no confirmation arm — the split above checks nothing"]
    : true
] = [true, true];

/**
 * A status a newer backend added: the trigger flow asks `isListedVariant` first
 * and prints the server's word, so the twin must admit every such answer.
 */
const _triggerUnlisted: UnlistedArmAdmitted<
  "TriggerDeploymentReadResponse",
  VibeUnlistedVariant<"status">,
  VibeData<"TriggerDeployment">,
  "status"
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_DEPLOYMENT_TRIGGER_WIRE_TYPES_CONFORM = [
  _triggerSuccess,
  _triggerConfirmation,
  _triggerArmsNonEmpty,
  _triggerUnlisted
] as const;
