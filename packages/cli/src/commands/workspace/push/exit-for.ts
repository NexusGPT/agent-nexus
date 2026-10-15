import type { WorkspaceUploadBatchResponse } from "@agent-nexus/sdk";

import { EXIT_CODES } from "../../../exit-codes";

/**
 * A FAILED row exits the run; which category says whose fault it was. Every
 * failure a local read → `local-failed`; any failure the server answered →
 * `remote-error`, even beside local ones, because that is the one a retry
 * against the server can change.
 */
export function exitFor(merged: WorkspaceUploadBatchResponse, localFailures: number): number {
  if (merged.failureCount === 0) return EXIT_CODES.success;
  if (localFailures === merged.failureCount) return EXIT_CODES["local-failed"];
  return EXIT_CODES["remote-error"];
}
