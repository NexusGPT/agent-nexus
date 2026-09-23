import { color } from "../../../output";
import type { VibeLiveDeploymentDto, VibeServedArtifactDto } from "../../../vibe-wire-types";
import { formatInstant } from "./format-instant";
import { shortSha } from "./short-sha";

/**
 * The `live` block, plus the "not proven" line whose absence would be the
 * original defect.
 */
export function formatLiveLines(
  live: VibeLiveDeploymentDto | null,
  served: VibeServedArtifactDto | null
): string[] {
  if (live === null) {
    return [
      `${color.bold("Live".padEnd(12))}  ${color.dim("nothing in the live slot — never deployed, or every version is down")}`
    ];
  }

  const lines = [
    `${color.bold("Live".padEnd(12))}  ${color.green(`v${String(live.versionNumber)}`)}  ${shortSha(live.commitSha)}  ${live.url ?? color.dim("(no public URL recorded)")}`,
    color.dim(
      `  The newest HEALTHY deployment — the ALLOCATION's verdict, which lands BEFORE the edge swaps. Triggered ${formatInstant(live.createdAt)}.`
    )
  ];

  if (live.servedProvenAt !== null) return lines;

  // 🔴 The line this command exists for. "not proven" is a statement about
  // EVIDENCE; a reader who takes it for "not serving" has reinvented the bug.
  lines.push(
    color.yellow(
      `  Not PROVEN served${served === null ? "" : " — see Served below"}. Not proven is not "not serving".`
    ),
    color.dim(
      "  The proof sweep only considers a deployment that went healthy recently, so a swap slower than its window — or an app the probe cannot reach — stays unproven permanently while serving perfectly well."
    )
  );
  return lines;
}
