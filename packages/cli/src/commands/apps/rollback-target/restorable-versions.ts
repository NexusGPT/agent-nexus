import type { VibeDeploymentDto } from "../../../vibe-deployment-wire-types";
import { isRestorable } from "./restorable-status";

/**
 * The versions a rollback could name right now, newest first.
 *
 * Exported because the refusals are only as useful as this list — an operator
 * told "no version v7" wants to know what there IS, and the alternative is
 * making them run a second command to find out.
 */
export function restorableVersions(deployments: readonly VibeDeploymentDto[]): number[] {
  return deployments
    .filter(isRestorable)
    .map((deployment) => deployment.versionNumber)
    .sort((a, b) => b - a);
}
