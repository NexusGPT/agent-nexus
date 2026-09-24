/**
 * `nexus apps deploy-state` — "did my push land, and is what I pushed what is
 * live", answered by the platform in one call.
 *
 * ── Why a CLI verb, when the endpoint already exists ────────────────────────
 *
 * The endpoint was built because a client parsing `git push` stdout cannot
 * classify its own push: rejection lines print FIRST (so a pipe through `tail`
 * destroys them), `-q` suppresses the success report but not the failure one, a
 * backgrounded push carries no outcome at all, and an error quoting a remote URL
 * is shape-identical to a success report. The measured consequence was failures
 * read as successes.
 *
 * Shipping the endpoint with no verb reproduces that defect one layer up: an
 * answer nobody can reach is not an answer. A client that cannot find this
 * writes the parser again.
 *
 * ── The two things this renderer exists to get right ────────────────────────
 *
 * 1. `served` IS AN OBSERVATION, AND ITS AGE IS PART OF THE ANSWER. Nothing
 *    re-checks the row after the probe writes it, so a rollback or a newer
 *    deploy since `provenAt` is not reflected. Every line that mentions
 *    `served` carries how old it is — see `format-served-lines.ts`.
 *
 * 2. `live.servedProvenAt === null` MUST NEVER RENDER AS "NOT SERVING", AND
 *    THE NULL CAN BE PERMANENT. The proof sweep only considers a deployment
 *    whose healthy row is inside its window, so a swap slower than that — or an
 *    app the probe cannot reach at all — stays unproven forever while serving
 *    perfectly well. The words are "not proven", and the reason is printed
 *    beside them, because "not proven" on its own is the same trap with a
 *    politer label. `format-live-lines.ts` owns that line.
 *
 * Rendering is pure and separated from the HTTP call so both can be asserted
 * without a network — the command wiring lives in `apps/deploy/deploy-state.command.ts`.
 */

import { color } from "../../../output";
import { nonBlankOr } from "../../../util/present-text";
import type { GetDeployStateResponse } from "../../../vibe-wire-types";
import { colorizeStatus, paintReasonForStatus } from "../_shared/colorize-status";
import { formatReplacedBy } from "../_shared/format-replaced-by";
import { describeOutcome } from "./describe-outcome";
import { formatInstant } from "./format-instant";
import { formatLiveLines } from "./format-live-lines";
import { formatServedLines } from "./format-served-lines";
import { shortSha } from "./short-sha";

/**
 * The whole answer, as lines.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the ages above are
 * assertable — an age is the field most likely to be silently dropped in a
 * refactor, and a test that cannot pin "now" cannot notice.
 */
export function renderDeployState(data: GetDeployStateResponse, nowMs: number): string[] {
  const lines: string[] = [`${color.bold("Outcome".padEnd(12))}  ${describeOutcome(data.outcome)}`];

  const askedBy =
    data.resolved.from === "deployBranch"
      ? "the app's own deploy branch"
      : `the ${data.resolved.from} you named`;
  lines.push(
    `${color.bold("Commit".padEnd(12))}  ${data.resolved.sha === null ? color.dim("— none resolved") : shortSha(data.resolved.sha)}  ${color.dim(`${nonBlankOr(data.resolved.refName, "no ref head matches this commit")} — resolved from ${askedBy}`)}`
  );

  lines.push(
    data.ref === null
      ? `${color.bold("Receipt".padEnd(12))}  ${color.dim("no ref row — the platform has no record of a push on this ref")}`
      : `${color.bold("Receipt".padEnd(12))}  ${shortSha(data.ref.sha)} ${color.dim(`is the head of ${data.ref.refName}, last moved ${formatInstant(data.ref.updatedAt)}`)}`
  );

  if (data.deployment === null) {
    lines.push(`${color.bold("Deployment".padEnd(12))}  ${color.dim("none for this commit")}`);
  } else {
    const d = data.deployment;
    lines.push(
      `${color.bold("Deployment".padEnd(12))}  v${String(d.versionNumber)}  ${colorizeStatus(d.status)}  ${color.dim(d.id)}`
    );
    // The commit asked about is often the one a newer push displaced, so this
    // is where "did my push land" most needs to say what landed instead.
    if (d.status === "DISPLACED") {
      lines.push(`  replaced by ${formatReplacedBy(d.displacedBy)}`);
    }
    if (d.errorReason !== null) {
      lines.push(paintReasonForStatus(d.status, `  ${d.errorReason}`));
    }
    if (data.buildJob !== null && data.buildJob.waiting !== null) {
      lines.push(color.yellow(`  build ${data.buildJob.status}: ${data.buildJob.waiting.message}`));
    }
    if (data.buildJob !== null && data.buildJob.errorReason !== null) {
      lines.push(
        paintReasonForStatus(
          data.buildJob.status,
          `  build ${data.buildJob.status}: ${data.buildJob.errorReason}`
        ),
        color.dim(`  logs: ${data.buildJob.logsRef === "" ? "—" : data.buildJob.logsRef}`)
      );
    }
  }

  lines.push(...formatLiveLines(data.live, data.served));
  lines.push(...formatServedLines(data.live, data.served, nowMs));

  return lines;
}
