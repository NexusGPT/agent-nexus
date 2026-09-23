import { color } from "../../../output";
import type { WatchOutcome } from "./watch-outcome";

export function printFailed(
  outcome: Extract<WatchOutcome, { kind: "failed" }>,
  appId: string
): void {
  console.log(
    color.red("✗") +
      ` v${String(outcome.deployment.versionNumber)} ${outcome.deployment.status.toLowerCase().replace("_", " ")}`
  );
  if (outcome.deployment.errorReason !== null) {
    console.log(`  ${outcome.deployment.errorReason}`);
  }
  console.log(
    color.dim(`  Build log: nexus apps deployments get ${appId} ${outcome.deployment.id}`)
  );
}
