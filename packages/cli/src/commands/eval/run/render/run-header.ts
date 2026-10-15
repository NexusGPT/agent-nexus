import type { PromptEvalRun } from "@agent-nexus/sdk";

import { color } from "../../../../output";
import { firstNonBlankOr } from "../../../../util/present-text";
import { formatScore, formatUsd } from "./_shared/format";

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
  // `repetitions` governs CUSTOM criteria only — `golden_match` is judged once
  // whatever it says — so the line names what the number applies to rather than
  // reading as the run's global judge count.
  console.log(
    `judge: ${run.judgeConfig.model} ` +
      `(custom criteria x${run.judgeConfig.repetitions}, golden_match x1)`
  );
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
