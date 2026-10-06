/**
 * The deploy trigger's answer as the CLI READS it: the listed union from
 * `vibe-wire-types.ts`, or a status a backend newer than this binary added.
 *
 * The listed statuses are a `Record` over the union, so a status added to it does
 * not compile here until it is listed — `isListedVariant` can never file a known
 * answer as unlisted. `vibe-wire-types.conformance.ts` holds the listed union
 * and the unlisted twin to the contract.
 *
 * Its own module because `vibe-wire-types.ts` sits on the shrink-only size
 * ledger, and these are runtime values the trigger flow needs.
 */

import type { ListedDiscriminants, VibeUnlistedVariant } from "./vibe-unlisted-variant";
import type { TriggerDeploymentResponse } from "./vibe-wire-types";

/** A deploy trigger's answer: a listed status, or the server's word for a newer one. */
export type TriggerDeploymentReadResponse =
  | TriggerDeploymentResponse
  | VibeUnlistedVariant<"status">;

export const TRIGGER_DEPLOYMENT_STATUSES: ListedDiscriminants<TriggerDeploymentResponse, "status"> =
  { created: true, reused: true, confirmation_required: true };
