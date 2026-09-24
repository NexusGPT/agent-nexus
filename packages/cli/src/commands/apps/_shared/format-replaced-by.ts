import type { VibeDeploymentDisplacerDto } from "../../../vibe-deployment-wire-types";

/**
 * The newer deployment that displaced this one: `v8 · 1a2b3c4`.
 *
 * Read only from the structured `displacedBy`, never from `errorReason`. That
 * prose spells the same fact for a human reader, and parsing it back out would
 * give this binary a second definition of the sentence, one that breaks the
 * first time the backend rewords it. Absent, from a backend a release behind or
 * a row whose audit record is missing, it says "a newer deployment" and claims
 * nothing more.
 */
export function formatReplacedBy(
  displacedBy: VibeDeploymentDisplacerDto | null | undefined
): string {
  if (displacedBy === null || displacedBy === undefined) return "a newer deployment";
  return `v${String(displacedBy.versionNumber)} · ${displacedBy.triggerSha.slice(0, 7)}`;
}
