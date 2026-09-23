import { color } from "../../../output";
import { formatDuration } from "./format-duration";
import type { WatchOutcome } from "./watch-outcome";

/**
 * NOT a failure claim. The deploy may still be converging; what is true is that
 * we stopped looking, and saying so is the entire contract.
 */
export function printDeployTimeout(
  outcome: Extract<WatchOutcome, { kind: "deploy-timeout" }>,
  appId: string
): void {
  console.log(
    color.yellow("!") +
      ` still ${outcome.deployment.status} after ${formatDuration(outcome.waitedMs)} — stopped waiting.`
  );
  console.log(
    color.dim(`  Still running: nexus apps deployments get ${appId} ${outcome.deployment.id}`)
  );
}
