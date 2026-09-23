import { color } from "../../../output";
import type { WatchOutcome } from "./watch-outcome";

export function printSuperseded(outcome: Extract<WatchOutcome, { kind: "superseded" }>): void {
  console.log(
    color.yellow("!") +
      ` v${String(outcome.deployment.versionNumber)} was superseded by a newer deployment — it will never go live.`
  );
}
