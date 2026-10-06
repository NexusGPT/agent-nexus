/**
 * The two runner ticks as the CLI READS them: the listed union from
 * `admin-wire-types.ts`, or an outcome a backend newer than this binary added.
 *
 * Each runner's listed kinds are a `Record` over its union, so a kind added to
 * the union does not compile here until it is listed — which is what keeps
 * `isListedVariant` from filing a known outcome as unlisted. The conformance
 * modules (`admin-vibe-runner-ticks.conformance.ts` and its deployment twin)
 * hold the listed union and the unlisted twin to the contract.
 *
 * Its own module because `admin-wire-types.ts` is a mirror of response shapes,
 * and these are runtime values a printer needs.
 */

import type {
  AdminVibeBuildRunnerTickResponse,
  AdminVibeDeploymentRunnerTickResponse
} from "./admin-wire-types";
import type { ListedDiscriminants, VibeUnlistedVariant } from "./vibe-unlisted-variant";

/** A build-runner tick: a listed outcome, or the server's word for a newer one. */
export type AdminVibeBuildRunnerTickReadResponse =
  | AdminVibeBuildRunnerTickResponse
  | VibeUnlistedVariant<"kind">;

export const BUILD_RUNNER_TICK_KINDS: ListedDiscriminants<
  AdminVibeBuildRunnerTickResponse,
  "kind"
> = {
  idle: true,
  dispatched: true,
  race_lost: true,
  org_at_capacity: true,
  region_at_capacity: true,
  dispatch_failed_requeued: true,
  dispatch_failed_compensated: true
};

/** A deployment-runner tick: a listed outcome, or the server's word for a newer one. */
export type AdminVibeDeploymentRunnerTickReadResponse =
  | AdminVibeDeploymentRunnerTickResponse
  | VibeUnlistedVariant<"kind">;

export const DEPLOYMENT_RUNNER_TICK_KINDS: ListedDiscriminants<
  AdminVibeDeploymentRunnerTickResponse,
  "kind"
> = {
  idle: true,
  dispatched: true,
  dispatch_failed_compensated: true,
  timed_out: true,
  displaced: true
};
