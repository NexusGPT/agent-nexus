import { color, isJsonMode } from "../../../output";
import { type RollbackAppResponse } from "../../../vibe-wire-types";

export function printRollback(data: RollbackAppResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const restored = data.restoredDeployment;
  console.log(color.green("✓") + " Rollback started");
  console.log(
    `  v${String(data.supersededDeployment.versionNumber)} → v${String(restored.versionNumber)} (${restored.triggerSha.slice(0, 7)})`
  );
  // Said explicitly because the word "rollback" reads as destructive: the
  // outgoing version keeps serving until the restored one is healthy.
  console.log(
    color.dim("  The version serving now keeps every request until the restored one is healthy.")
  );
}
