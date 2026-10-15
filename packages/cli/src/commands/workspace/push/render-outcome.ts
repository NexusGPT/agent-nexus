import type { WorkspaceUploadBatchResponse, WorkspaceUploadResult } from "@agent-nexus/sdk";

import { color } from "../../../output";
import type { PushPlan } from "./push-plan";

function renderRow(row: WorkspaceUploadResult): string {
  if (row.success) return `  ${row.path}`;
  if (row.skipped) return color.dim(`  ${row.path}  skipped: ${row.error}`);
  return color.red(`  ${row.path}  FAILED: ${row.error}`);
}

/** The human view: one line per file, then the counts. */
export function renderOutcome(
  slug: string,
  merged: WorkspaceUploadBatchResponse,
  plan: PushPlan
): void {
  for (const row of merged.results) console.log(renderRow(row));
  const verdict =
    `${merged.successCount} pushed to "${slug}"` +
    (merged.skippedCount > 0 ? `, ${merged.skippedCount} skipped` : "") +
    (merged.failureCount > 0 ? `, ${merged.failureCount} failed` : "");
  console.log((merged.failureCount > 0 ? color.red("✗") : color.green("✓")) + " " + verdict);
  if (plan.hiddenSkipped > 0) {
    console.log(
      color.dim(
        `  ${plan.hiddenSkipped} hidden entr${plan.hiddenSkipped === 1 ? "y" : "ies"} left out (--include-hidden to push them)`
      )
    );
  }
}
