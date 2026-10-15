import type { PromptEvalCaseWithScores } from "@agent-nexus/sdk";

/**
 * One matrix cell: its score, or why there is no score.
 *
 * `golden_match` is the criterion the matrix is about, so it wins when present;
 * a cell carrying only custom criteria falls back to all of them rather than
 * reading as unscored. INCONCLUSIVE repetitions are dropped before the mean,
 * matching the rollup — counting one would report a judge outage as a low score.
 */
export function cellText(one: PromptEvalCaseWithScores): string {
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
