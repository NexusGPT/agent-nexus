import { color } from "../../../output";
import type { VibeUnlistedValue } from "../../../vibe-deploy-state-vocabulary";
import { isListedKey } from "../../../vibe-unlisted-variant";
import { type VibeBuildComputeSize } from "../../../vibe-wire-types";
import { formatUnlistedWord } from "./format-unlisted-word";

/**
 * The `Build size` line, one per size. A `Record` keyed by the union, so a size
 * added here without a line is a compile error.
 */
export const BUILD_COMPUTE_SIZE_LINES: Record<VibeBuildComputeSize, string> = {
  MEDIUM: "medium" + color.dim(" — 7 GB, 4 vCPU"),
  LARGE: "large" + color.dim(" — 15 GB, 8 vCPU")
};

/**
 * Render a build size, including the two cases the union cannot describe — the
 * same posture as `formatShipGateMode`: a size this binary does not know is
 * echoed rather than mapped, and an absent one (a backend predating the field)
 * is unreported, never `large`.
 */
export function formatBuildComputeSize(
  size: VibeBuildComputeSize | VibeUnlistedValue | undefined
): string {
  if (size === undefined) return color.dim("not reported by this server");
  if (!isListedKey(BUILD_COMPUTE_SIZE_LINES, size)) {
    return formatUnlistedWord(size, "size");
  }
  return BUILD_COMPUTE_SIZE_LINES[size];
}
