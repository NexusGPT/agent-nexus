import { color } from "../../../output";
import type { WatchOutcome } from "./watch-outcome";

/**
 * A build somebody stopped. Not a failure — nothing about it broke — and not a
 * hand-off either: nothing replaced it. It ends the watch because the version
 * being watched will never go live, and says so without blame.
 */
export function printCancelled(outcome: Extract<WatchOutcome, { kind: "cancelled" }>): void {
  console.log(
    color.yellow("!") +
      ` v${String(outcome.deployment.versionNumber)} never went live — its build was cancelled. Whatever was serving keeps serving.`
  );
}
