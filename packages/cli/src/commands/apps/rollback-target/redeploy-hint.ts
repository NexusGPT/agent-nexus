import type { VibeDeploymentDto } from "../../../vibe-deployment-wire-types";

/**
 * "Redeploy that commit instead" — the correct remedy whenever the named
 * version exists but cannot be RESTORED.
 *
 * A restore re-places a retained image; a version with no usable image can only
 * be reached by building its commit again. The deployment row carries that
 * commit, so the hint names the exact command rather than describing it.
 */
export function redeployHint(appId: string, deployment: VibeDeploymentDto): string {
  return `To ship that commit again, build it: nexus apps deploy ${appId} --sha ${deployment.triggerSha}.`;
}
