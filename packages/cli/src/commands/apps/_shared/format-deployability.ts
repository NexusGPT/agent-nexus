import { color } from "../../../output";
import {
  type VibeAppDeployability,
  type VibeAppGitProjectSummaryDto
} from "../../../vibe-wire-types";

/**
 * The table-cell rendering of {@link formatDeployability} — same three states,
 * no remedy text. A cell cannot carry the fix, so `app get` does.
 *
 * `DEPLOYABLE` is dim and the two failures are coloured: in a fleet listing,
 * the working rows are the background and the broken ones are what the eye
 * should catch.
 */
export function formatDeployabilityCell(deployability: VibeAppDeployability): string {
  if (deployability === "DEPLOYABLE") return color.dim("ready");
  if (deployability === "NO_SOURCE_ATTACHED") return color.red("no source");
  if (deployability === "SOURCE_NOT_READY") return color.yellow("not ready");
  // Absent, not unknown — see `formatDeployability`. A dash is the table's
  // existing vocabulary for "this server did not say".
  return color.dim("—");
}

/**
 * One line saying whether this app can deploy at all, and what to do when it
 * cannot.
 *
 * `NO_SOURCE_ATTACHED` is red rather than dim because it is the state that used
 * to be invisible: an app with no git project renders `Edge: not checked yet`
 * and `Public URL: …` exactly like a wired app nobody has pushed to, so an
 * operator asking "why does my URL do nothing" got no answer from this command
 * at all. The two failing values name DIFFERENT fixes — attach a project, or
 * wait for / repair the one already attached — which is the whole reason the
 * enum has three values instead of a boolean.
 */
export function formatDeployability(
  deployability: VibeAppDeployability,
  gitProject: VibeAppGitProjectSummaryDto | null
): string {
  if (deployability === "DEPLOYABLE") {
    return color.green("deployable") + color.dim(" — a push to the deploy branch builds");
  }
  if (deployability === "NO_SOURCE_ATTACHED") {
    return (
      color.red("no source attached") +
      color.dim(" — nothing to build; attach one with `apps attach-repo`")
    );
  }
  if (deployability === "SOURCE_NOT_READY") {
    return (
      color.yellow("source not ready") +
      color.dim(
        gitProject === null || gitProject === undefined
          ? " — the attached git project is not READY"
          : ` — git project "${gitProject.name}" is ${gitProject.status}`
      )
    );
  }
  // An if-chain with a fallback rather than an exhaustive switch, and the
  // reason is version skew, not style: this CLI ships standalone to npm and is
  // routinely pointed at a backend older than itself. `deployability` is a
  // recent field, so it can be genuinely absent on the wire, and a switch the
  // compiler believes is exhaustive would return `undefined` and print it. The
  // same reflex is already visible three times in this file as
  // `data.gitProject ?? data.repository`, and once next door as
  // `edgeReachability`'s "last check was inconclusive".
  return color.dim("not reported by this server");
}
