import type {
  PreviewPromptEvalRunBody,
  PromptEvalCheckpointSelection,
  PromptEvalJudgeOverride,
  PromptEvalRunPreview
} from "@agent-nexus/sdk";

import { color } from "../../../../output";

/** The flags `run create` and `run preview` share, parsed. */
export interface MatrixFlags {
  conversations: string[];
  checkpoints: PromptEvalCheckpointSelection[];
  variants: string[];
  baseline: string;
  judgeModel?: string;
  repetitions?: number;
}

/**
 * The matrix plan both verbs send. `create` extends it with `--name` and the
 * budget cap; `preview` sends it as-is.
 *
 * A key is OMITTED rather than sent as undefined: the server distinguishes
 * "no judge override" from "an override with no fields in it".
 */
export function buildMatrixPlan(flags: MatrixFlags): PreviewPromptEvalRunBody {
  const judge: PromptEvalJudgeOverride = {
    ...(flags.judgeModel !== undefined ? { model: flags.judgeModel } : {}),
    ...(flags.repetitions !== undefined ? { repetitions: flags.repetitions } : {})
  };
  return {
    conversationIds: flags.conversations,
    ...(flags.checkpoints.length > 0 ? { checkpoints: flags.checkpoints } : {}),
    variants: flags.variants,
    baseline: flags.baseline,
    ...(Object.keys(judge).length > 0 ? { judge } : {})
  };
}

/**
 * What a preview prints — shared because `run create --dry-run` and
 * `run preview` are the same call and must stay the same output.
 */
export function printMatrixPreview(preview: PromptEvalRunPreview): void {
  console.log(
    `${preview.caseCount} cases: ${preview.candidates.length} variants x ` +
      `${preview.selection.reduce((n, s) => n + s.turnIndexes.length, 0)} checkpoints`
  );
  for (const warning of preview.warnings) console.log(color.yellow(warning));
  console.log(color.dim("Nothing was created."));
}
