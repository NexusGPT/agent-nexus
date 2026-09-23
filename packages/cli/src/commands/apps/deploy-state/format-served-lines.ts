import { color } from "../../../output";
import type { VibeLiveDeploymentDto, VibeServedArtifactDto } from "../../../vibe-wire-types";
import { formatAge } from "./format-age";
import { formatInstant } from "./format-instant";
import { shortSha } from "./short-sha";

/**
 * The served-artifact block — the half of this command that is easiest to get
 * dangerously wrong, and therefore the half with its own function and its own
 * assertions.
 *
 * Three cases, exhaustive by construction (the schema documents them as such):
 *
 *   · `served === null`      — never observed. NOT "nothing is live".
 *   · same deployment as `live` — the swap is done AND proven.
 *   · a different deployment — as of `provenAt` the edge was still on the
 *     previous build, which is what a null `live.servedProvenAt` MEANS.
 *
 * Every branch prints `provenAt`'s age, and no branch ever prints the words
 * "not serving".
 */
export function formatServedLines(
  live: VibeLiveDeploymentDto | null,
  served: VibeServedArtifactDto | null,
  nowMs: number
): string[] {
  if (served === null) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.dim("not observed")}`,
      color.dim("  The platform has never seen the edge answer with any build of this app."),
      color.dim(
        "  This is NOT a statement that nothing is being served — the probe needs a public URL it can reach, and an app it cannot reach is never proven at all."
      )
    ];
  }

  const age = formatAge(nowMs - Date.parse(served.provenAt));
  const observed = `${age} ${color.dim(`(${formatInstant(served.provenAt)})`)}`;
  const proven = live !== null && live.deploymentId === served.deploymentId;

  if (proven) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.green(`v${String(live.versionNumber)}`)}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
      color.dim(
        `  Swapped ${String(Math.round(served.healthyToServedMs / 1000))}s after that deployment went healthy (an UPPER bound — the probe samples on a sweep).`
      ),
      color.dim(
        "  An observation, not a live reading: nothing re-checks it, so anything that changed since is not reflected here."
      )
    ];
  }

  // Nothing is HEALTHY, yet the edge WAS observed answering. There is no
  // "previous" for this build to be previous TO, and no live slot it failed to
  // swap to — claiming either contradicts the Live line printed directly above,
  // which says the slot is empty. The observation still stands on its own; that
  // is exactly what a mandatory `provenAt` buys.
  if (live === null) {
    return [
      `${color.bold("Served".padEnd(12))}  ${color.yellow("last observed")}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
      color.dim(
        "  As of that observation the edge was answering with this build. Nothing is in the live slot now, so this is the last build the platform saw served — NOT one that something newer has replaced."
      ),
      color.dim(`  Deployment ${served.deploymentId}, image ${served.imageRef}.`)
    ];
  }

  // The case the whole `served` field was added for. `live.servedProvenAt` is
  // null here, and this block is what that null means.
  return [
    `${color.bold("Served".padEnd(12))}  ${color.yellow("previous build")}  ${shortSha(served.commitSha)}  ${color.dim("observed")} ${observed}`,
    color.dim(
      `  As of that observation the edge was still answering with this build, not with v${String(live.versionNumber)} (${shortSha(live.commitSha)}).`
    ),
    color.dim(`  Deployment ${served.deploymentId}, image ${served.imageRef}.`)
  ];
}
