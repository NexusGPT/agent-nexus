import type { WorkspaceUploadBatchResponse } from "@agent-nexus/sdk";

/** Fold the per-pack responses into one document with the same shape. */
export function mergeResponses(
  responses: readonly WorkspaceUploadBatchResponse[]
): WorkspaceUploadBatchResponse {
  const results = responses.flatMap((response) => response.results);
  return {
    results,
    successCount: responses.reduce((sum, r) => sum + r.successCount, 0),
    failureCount: responses.reduce((sum, r) => sum + r.failureCount, 0),
    skippedCount: responses.reduce((sum, r) => sum + r.skippedCount, 0)
  };
}
