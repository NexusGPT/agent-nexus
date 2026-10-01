import { reportFailure } from "../../../errors";
import { color, isJsonMode } from "../../../output";
import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import type { GetVibeAppLogsResponse } from "../../../vibe-wire-types";
import type { AppLogsRequest } from "./app-logs-request";
import { emitLogLines } from "./emit-log-lines";
import { judgeLogPipeline, judgeLogPipelineBeforeFollow } from "./judge-log-pipeline";
import { orderForDisplay } from "./order-for-display";
import { runAppLogsFollow } from "./run-app-logs-follow";
import { toLogQuery } from "./to-log-query";

/**
 * `nexus apps logs <appId>` once its flags have resolved: the page read, or the
 * follow behind a pipeline pre-flight. Sets `process.exitCode`; throws nothing
 * the command's own `handleError` does not already render.
 *
 * Every read is judged against the gateway's pipeline verdict — see
 * `judgeLogPipeline` for the matrix — so an empty result is only ever reported
 * as an answer when the pipeline that would have filled it is healthy.
 */
export async function runAppLogsRead(
  opts: TenantHttpOptions,
  appId: string,
  request: AppLogsRequest
): Promise<void> {
  const path = `/api/vibe/apps/${encodeURIComponent(appId)}/logs`;

  if (request.follow) {
    // Pre-flight: a follow over a pipeline nobody can vouch for would sit
    // printing nothing — the exact silence this check exists to end. One line
    // of the page route carries the gateway's verdict.
    const probe = await tenantRequest<GetVibeAppLogsResponse>(opts, {
      method: "GET",
      path,
      query: toLogQuery({ ...request, to: Date.now(), limit: 1 })
    });
    const preflight = judgeLogPipelineBeforeFollow(probe.pipeline);
    if (preflight.kind === "untrusted") {
      process.exitCode = reportFailure("remote-error", preflight.message, preflight.hint);
      return;
    }
    process.exitCode = await runAppLogsFollow(opts, appId, request);
    return;
  }

  const data = await tenantRequest<GetVibeAppLogsResponse>(opts, {
    method: "GET",
    path,
    query: toLogQuery(request)
  });
  emitLogLines(orderForDisplay(data.lines));
  const judgement = judgeLogPipeline(data.pipeline, data.lines.length);
  if (judgement.kind === "untrusted") {
    process.exitCode = reportFailure("remote-error", judgement.message, judgement.hint);
    return;
  }
  // Courtesy only, and stderr only: stdout stays a clean line stream.
  if (judgement.note !== null && !isJsonMode()) console.error(color.dim(judgement.note));
}
