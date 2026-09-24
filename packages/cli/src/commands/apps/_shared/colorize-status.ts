import { color } from "../../../output";
import type { VibeBuildJobStatus } from "../../../vibe-deployment-wire-types";
import type { WatchDeploymentStatus } from "../watch/watch-deployment-status";

/**
 * What a status says about the thing it describes.
 *
 * `ended` is the tone this file exists for. It covers CANCELLED, SUPERSEDED
 * and DISPLACED: terminal, and not a success, but nothing FAILED. A newer
 * commit replaced the work, or someone stopped it. Painting those red would
 * make a burst of pushes print as a wall of failures, with one green row at
 * the top, when every one of them is working as designed. That misreading is
 * the one the supersession was built to end.
 */
type StatusTone = "succeeded" | "failed" | "inFlight" | "ended";

/**
 * Dim for `ended`: the palette's existing voice for "true, finished, needs
 * nothing from you" (`not detected`, `No build job.`). It is visibly its own
 * colour next to green, red and yellow, and it steps back from the one row
 * that matters, the version actually serving.
 */
const TONE_PAINT: Record<StatusTone, (text: string) => string> = {
  succeeded: color.green,
  failed: color.red,
  inFlight: color.yellow,
  ended: color.dim
};

/**
 * Every deployment and build-job status, and its tone. Exhaustive over both
 * vocabularies. `vibe-wire-types.conformance.ts` holds each union to its
 * contract's exact members, so a status added upstream fails the typecheck
 * here until it is given a tone. It is never left to an if-chain that prints
 * it uncoloured.
 *
 * The two vocabularies share three names, and they agree on each. FAILED is
 * a failure on both. SUPERSEDED on a deployment served and was handed off,
 * and on a build job it was replaced mid-build: `ended` either way. PENDING
 * is `inFlight` on a build job and does not occur on a deployment.
 */
const STATUS_TONE: Record<WatchDeploymentStatus | VibeBuildJobStatus, StatusTone> = {
  HEALTHY: "succeeded",
  SUCCEEDED: "succeeded",

  FAILED: "failed",
  ROLLED_BACK: "failed",
  TIMED_OUT: "failed",
  LOST: "failed",

  BUILDING: "inFlight",
  AWAITING_APPROVAL: "inFlight",
  DEPLOYING: "inFlight",
  PENDING: "inFlight",
  QUEUED: "inFlight",
  ADMITTED: "inFlight",
  STARTING: "inFlight",
  RUNNING: "inFlight",

  CANCELLED: "ended",
  SUPERSEDED: "ended",
  DISPLACED: "ended"
};

/**
 * An OWN key, never `status in STATUS_TONE`: `in` walks the prototype, so a
 * backend sending `toString` would be looked up as a tone. (`Object.hasOwn`
 * is ES2022, past this package's `lib`.)
 */
function isKnownStatus(status: string): status is keyof typeof STATUS_TONE {
  return Object.prototype.hasOwnProperty.call(STATUS_TONE, status);
}

/**
 * Colorize a deployment or build-job status by its tone. A value this binary
 * has never heard of, sent by a newer backend, passes through plain. It is
 * printed, never refused.
 */
export function colorizeStatus(status: string): string {
  return isKnownStatus(status) ? TONE_PAINT[STATUS_TONE[status]](status) : status;
}

/**
 * How a row's `errorReason` is painted, by the tone of the status it explains.
 * Only a failure's reason is red. A superseded build carries a reason that
 * says nothing failed, and printing that sentence in red would contradict
 * itself. A status this binary does not know keeps the red every reason used
 * to get: an unfamiliar reason is not assumed harmless.
 */
const TONE_REASON_PAINT: Record<StatusTone, (text: string) => string> = {
  succeeded: color.dim,
  failed: color.red,
  inFlight: color.dim,
  ended: color.dim
};

export function paintReasonForStatus(status: string, text: string): string {
  return isKnownStatus(status) ? TONE_REASON_PAINT[STATUS_TONE[status]](text) : color.red(text);
}
