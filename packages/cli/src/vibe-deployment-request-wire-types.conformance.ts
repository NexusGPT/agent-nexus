/**
 * THE DRIFT GATE for `vibe-deployment-request-wire-types.ts` — cancel,
 * rollback, list and get. The TRIGGER response has its own module and its own
 * gate beside it.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 */

import type { TApi } from "@nexus/types";

import type {
  CancelDeploymentBuildResponse,
  GetDeploymentResponse,
  ListDeploymentsResponse,
  RollbackAppResponse
} from "./vibe-deployment-request-wire-types";
import type { VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

const _getDeployment: Mirrors<
  "GetDeploymentResponse",
  GetDeploymentResponse,
  VibeData<"GetDeployment">
> = AGREES;

const _listDeployments: Mirrors<
  "ListDeploymentsResponse",
  ListDeploymentsResponse,
  VibeData<"ListDeployments">
> = AGREES;

const _rollback: Mirrors<
  "RollbackAppResponse",
  RollbackAppResponse,
  VibeData<"RollbackApp">
> = AGREES;

/**
 * Cancel — split per arm on `outcome` by EXTRACTING each literal, which is sound
 * here where it is not for the trigger: the CLI models each outcome as its
 * own arm, exactly as the wire does. The non-empty guard below still proves each
 * extraction found an arm, because an empty one satisfies every `Mirrors` check.
 */
type WireCancel = VibeData<"CancelDeploymentBuild">;
type CancelledArm = { outcome: "cancelled" };
type AlreadyEndedArm = { outcome: "already_ended" };

const _cancelCancelled: Mirrors<
  "CancelDeploymentBuildResponse (cancelled)",
  Extract<CancelDeploymentBuildResponse, CancelledArm>,
  Extract<WireCancel, CancelledArm>
> = AGREES;

const _cancelAlreadyEnded: Mirrors<
  "CancelDeploymentBuildResponse (already_ended)",
  Extract<CancelDeploymentBuildResponse, AlreadyEndedArm>,
  Extract<WireCancel, AlreadyEndedArm>
> = AGREES;

const _cancelArmsNonEmpty: [
  [Extract<CancelDeploymentBuildResponse, CancelledArm>] extends [never]
    ? ["the CLI cancel union has no cancelled arm — the split above checks nothing"]
    : true,
  [Extract<CancelDeploymentBuildResponse, AlreadyEndedArm>] extends [never]
    ? ["the CLI cancel union has no already_ended arm — the split above checks nothing"]
    : true,
  [Extract<WireCancel, CancelledArm>] extends [never]
    ? ["the wire cancel union has no cancelled arm — the split above checks nothing"]
    : true,
  [Extract<WireCancel, AlreadyEndedArm>] extends [never]
    ? ["the wire cancel union has no already_ended arm — the split above checks nothing"]
    : true
] = [true, true, true, true];

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_DEPLOYMENT_REQUEST_WIRE_TYPES_CONFORM = [
  _getDeployment,
  _listDeployments,
  _rollback,
  _cancelCancelled,
  _cancelAlreadyEnded,
  _cancelArmsNonEmpty
] as const;
