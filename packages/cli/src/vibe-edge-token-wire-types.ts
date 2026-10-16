/**
 * THE PER-APP EDGE-AUTH TOKEN, and the visibility change that mints one.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-edge-token-wire-types.conformance.ts` is the gate.
 */

import type { VibeAppDto } from "./vibe-app-wire-types";

/**
 * An app's per-app edge-auth token — the shared secret the edge matches before
 * admitting a request to a PRIVATE app. Mirrors `VibeEdgeTokenSchema` in
 * packages/types/src/api/domains/vibe/schemas/edge-token.schemas.ts.
 *
 * `token` is a live credential: presenting it at the edge grants access to the
 * deployed app. It is printed only by `app edge-token` and `app
 * rotate-edge-token`, where revealing it is the whole point of the command.
 */
export interface VibeEdgeTokenDto {
  token: string;
  /** The header the edge matches the token against (`X-Vibe-App-Token`). */
  headerName: string;
  /** The app's canonical public URL. Null only for pre-canonical-URL rows. */
  publicUrl: string | null;
}

export interface SetVisibilityResponse {
  app: VibeAppDto;
  /**
   * The freshly-minted edge token, present only when going PRIVATE.
   * Deliberately NOT printed: this command's job is the posture change, and the
   * token has its own reveal command that says what it is.
   *
   * This was typed `string | null` until 2026-07-27, which the server contract
   * never matched — `SetVibeAppVisibilityResponseSchema` has always nested the
   * secret in the same three-field object as reveal and rotate. Nothing caught
   * it because the field is never read, so the lie stayed inert: a future reader
   * printing `data.edgeToken` would have rendered `[object Object]`.
   */
  edgeToken: VibeEdgeTokenDto | null;
  /** True when the app is registered as a tool and its edge token was rotated. */
  toolResyncRequired: boolean;
}

export interface GetEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
}

export interface RotateEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
  /**
   * True when the app is registered as an agent tool. Rotating invalidates the
   * token baked into that tool's auth, so it must be re-registered or it starts
   * 404-ing at the edge.
   */
  toolResyncRequired: boolean;
}
