import { color } from "../../../output";
import type { WatchOutcome } from "./watch-outcome";

export function printApprovalRefused(
  outcome: Extract<WatchOutcome, { kind: "approval-refused" }>
): void {
  console.log(
    color.red("✗") +
      ` v${String(outcome.deployment.versionNumber)} approval ${outcome.approval.status.toLowerCase()} — it will never deploy.`
  );
  // Says the quiet part: the deployment row still reads AWAITING_APPROVAL
  // and always will, so someone reading it later is not looking at a deploy
  // that is still waiting on them.
  console.log(
    color.dim("  The deployment stays AWAITING_APPROVAL by design; the gate is what was decided.")
  );
}
