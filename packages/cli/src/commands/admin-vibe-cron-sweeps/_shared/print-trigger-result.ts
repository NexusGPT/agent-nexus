/**
 * The generic cron manual-trigger response, and its renderer.
 *
 * Shared by both sweeps because the wire shape IS shared: one `trigger` verb
 * apiece against the same generic endpoint
 * (POST /api/admin/health/cron-jobs/:jobName/trigger) with a different pinned
 * CronKey, and the same response. What differs is only which `metadata` keys
 * each cron puts in the bag, which is why the caller supplies those.
 */

import { printRecord } from "../../../output";

/**
 * Manual-trigger response shape. Mirrors `ZAdminHealth.TriggerCronJob.Response`
 * — message is always present, executionId + metadata are optional. The
 * actual metadata for the rollback sweep is `{ candidates, rolledBack,
 * auditEventCount }` per the cron handler; the value-type is `unknown`
 * because the trigger endpoint is generic over all crons.
 */
export interface TriggerCronJobResponse {
  message: string;
  executionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Render a generic cron manual-trigger response. The wire shape is the
 * same for every cron (message + executionId + a per-cron `metadata`
 * bag); each caller supplies the `metadataFields` that flatten its own
 * metadata keys into readable rows. JSON mode falls through to the
 * dict-as-is so jq consumers still get the nested `metadata` envelope.
 */
export function printTriggerResult(
  data: TriggerCronJobResponse,
  metadataFields: { key: string; label: string; format?: (val: unknown) => string }[]
): void {
  const flat: Record<string, unknown> = {
    message: data.message,
    executionId: data.executionId ?? null,
    ...(data.metadata ?? {})
  };
  printRecord(flat, [
    { key: "message", label: "Result" },
    { key: "executionId", label: "Execution id", format: (v) => (v == null ? "—" : String(v)) },
    ...metadataFields
  ]);
}
