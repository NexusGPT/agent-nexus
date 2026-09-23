import { color } from "../../../output";
import { printServedVisibility } from "./print-served-visibility";
import type { WatchOutcome } from "./watch-outcome";

export function printServed(
  outcome: Extract<WatchOutcome, { kind: "served" }>,
  appId: string
): void {
  console.log(
    color.green("✓") +
      ` v${String(outcome.deployment.versionNumber)} is healthy and served` +
      (outcome.app.publicUrl === null ? " (no public URL — in-cluster only)" : "")
  );
  if (outcome.app.publicUrl !== null) {
    console.log(`  ${outcome.app.publicUrl}`);
    printServedVisibility(outcome.app.visibility, appId);
  }
}
