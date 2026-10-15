import type { PromptEvalCaseDetail } from "@agent-nexus/sdk";

import { color } from "../../../../output";

type CaseScore = PromptEvalCaseDetail["scores"][number];

/** Criteria in first-seen order, each holding its repetitions in the order judged. */
function groupByCriterion(scores: readonly CaseScore[]): Map<string, CaseScore[]> {
  const byCriterion = new Map<string, CaseScore[]>();
  for (const score of scores) {
    const bucket = byCriterion.get(score.criterion);
    if (bucket === undefined) byCriterion.set(score.criterion, [score]);
    else bucket.push(score);
  }
  return byCriterion;
}

/**
 * The mean and the AGREEMENT across one criterion's repetitions, or `null` when
 * there is only one sample to report.
 *
 * Agreement is the share of conclusive repetitions that returned the criterion's
 * most common verdict — "3/3 PASS" when the judge said the same thing every
 * time, "2/3 PASS" when it did not. That is the number worth showing, because
 * the measured failure mode (spec §5.5) is not a noisy score around a stable
 * verdict, it is the judge flipping PASS to FAIL on effectively the same reply.
 * A mean of 0.55 hides that; `2/3 PASS` states it.
 *
 * INCONCLUSIVE repetitions are excluded from both, matching the rollup: they
 * record that the judge produced no usable answer, and counting one as
 * disagreement would report a judge outage as judge uncertainty.
 */
function repetitionSummary(scores: readonly CaseScore[]): string | null {
  if (scores.length < 2) return null;
  const conclusive = scores.filter((s) => s.verdict !== "INCONCLUSIVE");
  if (conclusive.length === 0) return color.dim(`${scores.length} repetitions, none conclusive`);

  const mean = conclusive.reduce((sum, s) => sum + s.score, 0) / conclusive.length;
  const counts = new Map<string, number>();
  for (const score of conclusive) counts.set(score.verdict, (counts.get(score.verdict) ?? 0) + 1);
  const [verdict, agreed] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const agreement = `${agreed}/${conclusive.length} ${verdict}`;
  return `mean ${mean.toFixed(2)}  agreement ${
    agreed === conclusive.length ? agreement : color.yellow(agreement)
  }`;
}

/** The judge block: one group per criterion, each with its repetitions. */
function renderJudge(detail: PromptEvalCaseDetail): void {
  console.log(color.bold("JUDGE"));
  if (detail.scores.length === 0) {
    console.log(color.dim("(not scored)"));
    return;
  }
  for (const [criterion, scores] of groupByCriterion(detail.scores)) {
    const summary = repetitionSummary(scores);
    if (summary !== null) console.log(`${color.bold(criterion)}  ${summary}`);
    for (const score of scores) {
      const suffix = score.repetition > 1 ? ` #${score.repetition}` : "";
      const heading = summary === null ? color.bold(criterion + suffix) : `  #${score.repetition}`;
      console.log(`${heading}  ${score.score.toFixed(2)}  ${score.verdict}`);
      console.log(`  ${score.reasoning}`);
    }
  }
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

  renderJudge(detail);
}
