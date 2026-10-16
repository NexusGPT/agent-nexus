/**
 * THE DRIFT GATE for `vibe-edge-token-wire-types.ts` — the per-app edge-auth
 * token, the two routes that reveal or rotate it, and the visibility change
 * that mints one.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 */

import type { TApi } from "@nexus/types";

import type {
  GetEdgeTokenResponse,
  RotateEdgeTokenResponse,
  SetVisibilityResponse,
  VibeEdgeTokenDto
} from "./vibe-edge-token-wire-types";
import type { VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

const _edgeToken: Mirrors<
  "VibeEdgeTokenDto",
  VibeEdgeTokenDto,
  VibeData<"GetEdgeToken">["edgeToken"]
> = AGREES;

const _getEdgeToken: Mirrors<
  "GetEdgeTokenResponse",
  GetEdgeTokenResponse,
  VibeData<"GetEdgeToken">
> = AGREES;

const _rotateEdgeToken: Mirrors<
  "RotateEdgeTokenResponse",
  RotateEdgeTokenResponse,
  VibeData<"RotateEdgeToken">
> = AGREES;

const _setVisibility: Mirrors<
  "SetVisibilityResponse",
  SetVisibilityResponse,
  VibeData<"SetAppVisibility">
> = AGREES;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_EDGE_TOKEN_WIRE_TYPES_CONFORM = [
  _edgeToken,
  _getEdgeToken,
  _rotateEdgeToken,
  _setVisibility
] as const;
