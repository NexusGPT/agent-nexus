/**
 * THE DRIFT GATE for `vibe-deploy-state-wire-types.ts` — the deploy-state read
 * and the three rows it nests.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 */

import type { TApi } from "@nexus/types";

import type {
  GetDeployStateResponse,
  VibeLiveDeploymentDto,
  VibeRefDto,
  VibeServedArtifactDto
} from "./vibe-deploy-state-wire-types";
import type { VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

/**
 * The response `vibe deploy-state` renders, mirrored in full — no declared
 * omissions, deliberately.
 *
 * Every field of this payload is part of the answer: drop `served` and the
 * command cannot distinguish "proof has not arrived" from "the edge is still on
 * the old build", drop `resolved` and a caller who named nothing cannot tell
 * WHICH commit was answered about. A future field arriving here should stop the
 * build until someone decides whether the operator needs it, which is exactly
 * what an empty `Declared` makes happen.
 */
const _deployState: Mirrors<
  "GetDeployStateResponse",
  GetDeployStateResponse,
  VibeData<"GetDeployState">
> = AGREES;

const _deployStateRef: Mirrors<
  "VibeRefDto",
  VibeRefDto,
  NonNullable<VibeData<"GetDeployState">["ref"]>
> = AGREES;

const _liveDeployment: Mirrors<
  "VibeLiveDeploymentDto",
  VibeLiveDeploymentDto,
  NonNullable<VibeData<"GetDeployState">["live"]>
> = AGREES;

/**
 * `provenAt` and `healthyToServedMs` are mirrored and RENDERED, not merely
 * declared. An observation printed without its age is the defect this endpoint
 * exists to close, one layer up — so a future edit that drops either field has
 * to come through here first.
 */
const _servedArtifact: Mirrors<
  "VibeServedArtifactDto",
  VibeServedArtifactDto,
  NonNullable<VibeData<"GetDeployState">["served"]>
> = AGREES;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_DEPLOY_STATE_WIRE_TYPES_CONFORM = [
  _deployState,
  _deployStateRef,
  _liveDeployment,
  _servedArtifact
] as const;
