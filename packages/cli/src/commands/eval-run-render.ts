import type {
  PromptEvalCaseDetail,
  PromptEvalCaseWithScores,
  PromptEvalRun,
  PromptEvalRunResults
} from "@agent-nexus/sdk";

import { color } from "../output";
import { firstNonBlankOr } from "../util/present-text";

/**
 * The human renderers for `nexus eval run` — the matrix and the case view.
 *
 * Kept out of the command file because they are the only part of this
 * namespace with real layout logic, and because a table this shape is worth
 * testing on its own rather than through a command's action handler.
 */

/** A cell renders as its score, or as why there is no score. */
function cellText(one: PromptEvalCaseWithScores): string {
  if (one.status === "FAILED") return "FAIL!";
  if (one.status === "SKIPPED") return "skip";
  if (one.status === "PENDING" || one.status === "RUNNING") return "…";

  const goldenMatch = one.scores.filter((s) => s.criterion === "golden_match");
  const conclusive = (goldenMatch.length > 0 ? goldenMatch : one.scores).filter(
    (s) => s.verdict !== "INCONCLUSIVE"
  );
  if (conclusive.length === 0) return "?";

  const mean = conclusive.reduce((sum, s) => sum + s.score, 0) / conclusive.length;
  const verdict = conclusive.every((s) => s.verdict === "PASS") ? "P" : "F";
  return `${mean.toFixed(2)} ${verdict}`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function formatUsd(tenThousandths: number): string {
  return `$${(tenThousandths / 10_000).toFixed(4)}`;
}

function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

/**
 * The matrix: rows are checkpoints grouped by conversation, columns are the
 * candidate variants, then an aggregate row — and a delta column only when the
 * run chose a baseline (a variants-only run has nothing to compare against, so
 * an empty column would be worse than no column).
 */
export function renderResultsMatrix(results: PromptEvalRunResults): void {
  const { run, rollup, cases } = results;
  const variants = run.candidates;
  const hasBaseline = run.baselineVersionId !== null;

  const rowLabelWidth = 26;
  const colWidth = 14;

  console.log(
    `${color.bold(firstNonBlankOr([run.name], "eval run"))}  [${run.status}]${
      run.abortReason === null ? "" : ` (${run.abortReason})`
    }  ${run.id}`
  );
  console.log();

  const header =
    pad("CHECKPOINT", rowLabelWidth) + variants.map((v) => pad(v.variantName, colWidth)).join("");
  console.log(color.bold(header));

  const conversationIds = [...new Set(cases.map((c) => c.conversationId))];
  for (const conversationId of conversationIds) {
    console.log(color.dim(`conversation ${conversationId}`));
    const turnIndexes = [
      ...new Set(cases.filter((c) => c.conversationId === conversationId).map((c) => c.turnIndex))
    ].sort((a, b) => a - b);

    for (const turnIndex of turnIndexes) {
      const cells = variants.map((variant) => {
        const one = cases.find(
          (c) =>
            c.conversationId === conversationId &&
            c.turnIndex === turnIndex &&
            c.versionId === variant.versionId
        );
        return pad(one === undefined ? "-" : cellText(one), colWidth);
      });
      console.log(pad(`  turn ${turnIndex}`, rowLabelWidth) + cells.join(""));
    }
  }

  if (rollup === null) {
    console.log();
    console.log(color.dim("No rollup yet — the run has not finished."));
    return;
  }

  console.log();
  console.log(
    color.bold(
      pad("MEAN", rowLabelWidth) +
        variants
          .map((v) =>
            pad(
              formatScore(
                rollup.variants.find((r) => r.versionId === v.versionId)?.meanScore ?? null
              ),
              colWidth
            )
          )
          .join("")
    )
  );
  console.log(
    pad("PASS RATE", rowLabelWidth) +
      variants
        .map((v) =>
          pad(
            formatScore(rollup.variants.find((r) => r.versionId === v.versionId)?.passRate ?? null),
            colWidth
          )
        )
        .join("")
  );

  if (hasBaseline) {
    console.log(
      pad("DELTA VS BASELINE", rowLabelWidth) +
        variants
          .map((v) => {
            const delta = rollup.variants.find((r) => r.versionId === v.versionId)?.deltaVsBaseline;
            if (delta === undefined) return pad("—", colWidth);
            const text = `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`;
            return pad(delta < 0 ? color.red(text) : color.green(text), colWidth + 9);
          })
          .join("")
    );
  }

  const failed = rollup.variants.reduce((n, v) => n + v.failedCaseCount, 0);
  const inconclusive = rollup.variants.reduce((n, v) => n + v.inconclusiveScoreCount, 0);
  console.log();
  console.log(
    color.dim(
      `${cases.length} cases · ${failed} failed · ${inconclusive} inconclusive scores · ` +
        `${formatUsd(rollup.cost.totalUsdTenThousandths)} total ` +
        `(${formatUsd(rollup.cost.generationUsdTenThousandths)} agent, ` +
        `${formatUsd(rollup.cost.judgeUsdTenThousandths)} judge)`
    )
  );
  console.log(color.dim(`P = pass, F = fail, FAIL! = the cell could not run, ? = not scored`));
}

/** One cell: golden beside candidate, tool calls, and the judge's reasoning. */
export function renderCaseDetail(detail: PromptEvalCaseDetail): void {
  const toolLine = (calls: readonly { name: string }[]): string =>
    calls.length === 0 ? color.dim("(no tool calls)") : calls.map((t) => t.name).join(", ");

  console.log(
    `${color.bold(detail.variantName ?? detail.versionId)}  ` +
      `conversation ${detail.conversationId} turn ${detail.turnIndex}  [${detail.status}]`
  );
  if (detail.failureReason !== null) {
    console.log(color.red(`failed: ${detail.failureReason}`));
  }
  console.log();

  console.log(color.bold("GOLDEN"));
  console.log(detail.goldenSnapshot.content);
  console.log(color.dim(`tools: ${toolLine(detail.goldenSnapshot.toolCalls)}`));
  console.log();

  console.log(color.bold("CANDIDATE"));
  if (detail.candidate === null) {
    console.log(color.dim("(nothing was generated)"));
  } else {
    console.log(detail.candidate.content);
    console.log(color.dim(`tools: ${toolLine(detail.candidate.toolCalls)}`));
    console.log(color.dim(`emulator session: ${detail.candidate.sessionId}`));
  }
  console.log();

  console.log(color.bold("JUDGE"));
  if (detail.scores.length === 0) {
    console.log(color.dim("(not scored)"));
    return;
  }
  for (const score of detail.scores) {
    const suffix = score.repetition > 1 ? ` #${score.repetition}` : "";
    console.log(
      `${color.bold(score.criterion + suffix)}  ${score.score.toFixed(2)}  ${score.verdict}`
    );
    console.log(`  ${score.reasoning}`);
  }
}

/** The run header, for `run get` without `--case`. */
export function renderRun(run: PromptEvalRun): void {
  console.log(
    `${color.bold(firstNonBlankOr([run.name], "eval run"))}  [${run.status}]${
      run.abortReason === null ? "" : ` (${run.abortReason})`
    }`
  );
  console.log(`id: ${run.id}`);
  console.log(`agent: ${run.agentId}`);
  console.log(
    `variants: ${run.candidates.map((c) => c.variantName).join(", ")}` +
      (run.baselineVersionId === null ? "" : " (with baseline)")
  );
  console.log(`judge: ${run.judgeConfig.model} x${run.judgeConfig.repetitions}`);
  console.log(
    `cost: ${formatUsd(run.cost.totalUsdTenThousandths)} ` +
      `(${formatUsd(run.cost.generationUsdTenThousandths)} agent, ` +
      `${formatUsd(run.cost.judgeUsdTenThousandths)} judge)`
  );
  if (run.rollup !== null) {
    for (const variant of run.rollup.variants) {
      const delta =
        variant.deltaVsBaseline === undefined
          ? ""
          : `  delta ${variant.deltaVsBaseline > 0 ? "+" : ""}${variant.deltaVsBaseline.toFixed(3)}`;
      console.log(
        `  ${variant.name}: mean ${formatScore(variant.meanScore)}  ` +
          `pass ${formatScore(variant.passRate)}${delta}`
      );
    }
  }
}
