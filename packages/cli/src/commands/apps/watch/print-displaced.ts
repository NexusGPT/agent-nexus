import { color } from "../../../output";
import type { WatchOutcome } from "./watch-outcome";

/**
 * Says "never went live", not "was superseded". Both end the watch the same
 * way, but only one of them served, and someone reading this line is deciding
 * whether anything needs looking at. Not "never started" — a deploy already
 * handed to the executor may have started before it lost.
 */
export function printDisplaced(outcome: Extract<WatchOutcome, { kind: "displaced" }>): void {
  console.log(
    color.yellow("!") +
      ` v${String(outcome.deployment.versionNumber)} never went live — a newer deployment took over first. Nothing was interrupted.`
  );
}
