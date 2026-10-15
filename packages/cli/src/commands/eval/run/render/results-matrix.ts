import type {
  PromptEvalCaseWithScores,
  PromptEvalRunCandidate,
  PromptEvalRunResults,
  PromptEvalRunRollup
} from "@agent-nexus/sdk";

import { color } from "../../../../output";
import { firstNonBlankOr } from "../../../../util/present-text";
import { cellText } from "./_shared/cell-text";
import { formatScore, formatUsd, pad } from "./_shared/format";

/**
 * The matrix for `nexus eval run results` — rows are checkpoints grouped by
 * conversation, columns are the candidate variants, then an aggregate block.
 *
 * Kept out of the command file because it is the only part of this namespace
 * with real layout logic, and because a table this shape is worth testing on
 * its own rather than through a command's action handler.
 */

const ROW_LABEL_WIDTH = 26;
const COL_WIDTH = 14;

/** One block per conversation, one row per checkpoint turn, in turn order. */
function renderCaseRows(
  cases: readonly PromptEvalCaseWithScores[],
  variants: readonly PromptEvalRunCandidate[]
): void {
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
        return pad(one === undefined ? "-" : cellText(one), COL_WIDTH);
      });
      console.log(pad(`  turn ${turnIndex}`, ROW_LABEL_WIDTH) + cells.join(""));
    }
  }
}

/**
 * MEAN and PASS RATE always; a DELTA row only when the run chose a baseline (a
 * variants-only run has nothing to compare against, so an empty column would be
 * worse than no column).
 */
function renderRollupRows(
  rollup: PromptEvalRunRollup,
  variants: readonly PromptEvalRunCandidate[],
  hasBaseline: boolean
): void {
  const variantBy = (versionId: string): PromptEvalRunRollup["variants"][number] | undefined =>
    rollup.variants.find((r) => r.versionId === versionId);

  const scoreRow = (label: string, read: (versionId: string) => number | null): string =>
    pad(label, ROW_LABEL_WIDTH) +
    variants.map((v) => pad(formatScore(read(v.versionId)), COL_WIDTH)).join("");

  console.log();
  console.log(color.bold(scoreRow("MEAN", (id) => variantBy(id)?.meanScore ?? null)));
  console.log(scoreRow("PASS RATE", (id) => variantBy(id)?.passRate ?? null));

  if (!hasBaseline) return;
  console.log(
    pad("DELTA VS BASELINE", ROW_LABEL_WIDTH) +
      variants
        .map((v) => {
          const delta = variantBy(v.versionId)?.deltaVsBaseline;
          if (delta === undefined) return pad("—", COL_WIDTH);
          const text = `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`;
          return pad(delta < 0 ? color.red(text) : color.green(text), COL_WIDTH + 9);
        })
        .join("")
  );
}

/** The footer: case tallies, cost split, and the cell legend. */
function renderTotals(rollup: PromptEvalRunRollup, caseCount: number): void {
  const failed = rollup.variants.reduce((n, v) => n + v.failedCaseCount, 0);
  const inconclusive = rollup.variants.reduce((n, v) => n + v.inconclusiveScoreCount, 0);
  console.log();
  console.log(
    color.dim(
      `${caseCount} cases · ${failed} failed · ${inconclusive} inconclusive scores · ` +
        `${formatUsd(rollup.cost.totalUsdTenThousandths)} total ` +
        `(${formatUsd(rollup.cost.generationUsdTenThousandths)} agent, ` +
        `${formatUsd(rollup.cost.judgeUsdTenThousandths)} judge)`
    )
  );
  console.log(color.dim(`P = pass, F = fail, FAIL! = the cell could not run, ? = not scored`));
}

export function renderResultsMatrix(results: PromptEvalRunResults): void {
  const { run, rollup, cases } = results;
  const variants = run.candidates;

  console.log(
    `${color.bold(firstNonBlankOr([run.name], "eval run"))}  [${run.status}]${
      run.abortReason === null ? "" : ` (${run.abortReason})`
    }  ${run.id}`
  );
  console.log();
  console.log(
    color.bold(
      pad("CHECKPOINT", ROW_LABEL_WIDTH) +
        variants.map((v) => pad(v.variantName, COL_WIDTH)).join("")
    )
  );

  renderCaseRows(cases, variants);

  if (rollup === null) {
    console.log();
    console.log(color.dim("No rollup yet — the run has not finished."));
    return;
  }

  renderRollupRows(rollup, variants, run.baselineVersionId !== null);
  renderTotals(rollup, cases.length);
}
