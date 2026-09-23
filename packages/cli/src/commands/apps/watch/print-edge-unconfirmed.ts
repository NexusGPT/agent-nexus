import { color } from "../../../output";
import { formatDuration } from "./format-duration";
import type { WatchOutcome } from "./watch-outcome";

export function printEdgeUnconfirmed(
  outcome: Extract<WatchOutcome, { kind: "edge-unconfirmed" }>
): void {
  console.log(
    color.yellow("!") +
      ` v${String(outcome.deployment.versionNumber)} is HEALTHY, but the edge has not confirmed it is served (${formatDuration(outcome.waitedMs)}).`
  );
  console.log(
    `  Last edge verdict: ${outcome.app.edgeReachability ?? "never observed"}` +
      (outcome.app.edgeReachabilityDetail === null
        ? ""
        : ` — ${outcome.app.edgeReachabilityDetail}`)
  );
  // HEALTHY is an allocation verdict from a check that never crosses the
  // edge, so this is exactly the state where the two can disagree. Reporting
  // it as success is the failure this whole folder exists to prevent.
  console.log(color.dim("  HEALTHY means the container passed its own check, not that a"));
  console.log(color.dim("  visitor can reach it. Check the app's public URL directly."));
}
