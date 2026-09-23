import type { VibeDeploymentDto } from "../../../vibe-wire-types";
import { restorableVersions } from "./restorable-versions";

/** How many versions a hint lists before deferring to the full listing. */
const MAX_LISTED_VERSIONS = 5;

/**
 * The "here is what you can actually do" half of every refusal hint.
 *
 * Says the honest thing when the list is EMPTY rather than printing an empty
 * enumeration: "restorable versions: " with nothing after it reads as a
 * rendering bug, and leaves the operator without the one fact that explains the
 * refusal — that no version of this app is restorable at all.
 */
export function describeRestorable(
  appId: string,
  deployments: readonly VibeDeploymentDto[]
): string {
  const versions = restorableVersions(deployments);
  const listing = `Run "nexus apps deployments list ${appId}" to see every version.`;

  if (versions.length === 0) {
    return `No version of this app can be rolled back to — a target has to be a superseded version that still has its image. ${listing}`;
  }

  const shown = versions.slice(0, MAX_LISTED_VERSIONS).map((version) => `v${String(version)}`);
  const overflow = versions.length > MAX_LISTED_VERSIONS ? ", …" : "";
  return `Restorable versions: ${shown.join(", ")}${overflow}. ${listing}`;
}
