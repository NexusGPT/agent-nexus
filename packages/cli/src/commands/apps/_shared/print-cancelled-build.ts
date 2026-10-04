import { color, isJsonMode } from "../../../output";
import { type CancelDeploymentBuildResponse } from "../../../vibe-wire-types";

/**
 * What a cancel request did. The two outcomes print differently because they
 * are different facts: `cancelled` means THIS request stopped the build;
 * `already_ended` means there was nothing to stop, and the build's real status
 * is the answer — a build that finished a second before the request did not get
 * cancelled, and saying it did would be the one wrong line here.
 */
export function printCancelledBuild(data: CancelDeploymentBuildResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const d = data.deployment;
  const label = `v${String(d.versionNumber)} (${d.triggerSha.slice(0, 7)})`;
  if (data.outcome === "cancelled") {
    console.log(color.green("✓") + ` Build of ${label} cancelled`);
    console.log(
      color.dim(
        "  The build machine is released on the tenant agent's next pass. Whatever is serving keeps serving."
      )
    );
    return;
  }

  const build = data.buildJob === null ? "no build job" : `build ${data.buildJob.status}`;
  console.log(color.yellow("•") + ` Nothing to cancel — ${label} is ${d.status}, ${build}.`);
}
