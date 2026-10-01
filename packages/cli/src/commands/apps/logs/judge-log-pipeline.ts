import type { VibeLogPipelineHealthDto } from "../../../vibe-wire-types";

/**
 * What a read reports about its own trustworthiness, beyond its lines.
 *
 * `trusted` — the pipeline is healthy; `note` is a courtesy sentence (only for
 * an empty page) or null.
 * `untrusted` — the pipeline could not be vouched for; the command FAILS with
 * `message`, through `reportFailure("remote-error", …)`, after printing any
 * lines that did arrive.
 */
export type LogPipelineJudgement =
  | { kind: "trusted"; note: string | null }
  | { kind: "untrusted"; message: string; hint: string };

const HINT =
  "An empty or short result here does not mean the app printed nothing. The tenant's " +
  "log shipper or log store needs attention; the reason above names which part.";

/**
 * 🔴 AN EMPTY RESULT IS ONLY AN ANSWER WHEN THE PIPELINE IS KNOWN TO WORK. Every
 * tenant's log store sat empty for months while this command printed nothing
 * and succeeded — "the app printed nothing" and "nothing can arrive" were the
 * same output. So:
 *
 * | pipeline                        | lines | outcome                                  |
 * |---------------------------------|-------|------------------------------------------|
 * | healthy                         | some  | success, silent                          |
 * | healthy                         | none  | success, "no lines in window; healthy"   |
 * | unhealthy / unverified / absent | none  | FAILS: why the empty result is no answer |
 * | unhealthy / unverified / absent | some  | lines printed, then FAILS: incomplete    |
 *
 * `remote-error` is the category because it is literally that: the request
 * arrived and the platform's log path is what failed. The lines that did arrive
 * are still printed first — withholding real output because other output may
 * be missing helps nobody.
 */
export function judgeLogPipeline(
  pipeline: VibeLogPipelineHealthDto | undefined,
  lineCount: number
): LogPipelineJudgement {
  return judge(pipeline, lineCount > 0 ? "some-lines" : "no-lines");
}

/**
 * The same verdict for a `--follow` about to start: healthy proceeds silently,
 * anything else refuses — a follow over a pipeline nobody can vouch for would
 * sit printing nothing, which is the silence this ends.
 */
export function judgeLogPipelineBeforeFollow(
  pipeline: VibeLogPipelineHealthDto | undefined
): LogPipelineJudgement {
  return judge(pipeline, "follow");
}

function judge(
  pipeline: VibeLogPipelineHealthDto | undefined,
  read: "some-lines" | "no-lines" | "follow"
): LogPipelineJudgement {
  if (pipeline?.status === "healthy") {
    return {
      kind: "trusted",
      note:
        read !== "no-lines"
          ? null
          : `No log lines in this window. The log pipeline is healthy ` +
            `(${pipeline.reportingNodes}/${pipeline.expectedNodes} nodes reporting), ` +
            `so the app printed nothing here.`
    };
  }

  const why =
    pipeline === undefined
      ? "this tenant's log gateway predates pipeline health checks, so it cannot vouch for completeness"
      : `the log pipeline is ${pipeline.status} (${pipeline.reason}): ${pipeline.detail}` +
        (pipeline.silentNodes.length > 0
          ? ` Silent nodes: ${pipeline.silentNodes.join(", ")}.`
          : "");

  const message =
    read === "follow"
      ? `Not following — nothing printed would be trustworthy, because ${why}`
      : read === "some-lines"
        ? `These lines may be incomplete — ${why}`
        : `No log lines, and that is not an answer — ${why}`;
  return { kind: "untrusted", message, hint: HINT };
}
