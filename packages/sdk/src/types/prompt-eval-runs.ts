/**
 * PROMPT EVAL RUNS — the matrix (Prompt Lab phase 3).
 *
 * A run compares prompt VARIANTS against GOLDEN CONVERSATIONS: every cell is
 * "given this conversation's prefix, generate the next agent message under this
 * candidate prompt version, then judge it against the golden one".
 *
 * ## 🔴 A run spends real money
 *
 * Each cell runs the agent live — tools execute for real — and then calls a
 * judge. Preview first, and set `budgetCapUsdTenThousandths` to bound it.
 *
 * ## Timestamps are STRINGS
 *
 * ISO-formatted, handed back exactly as the wire carried them — same policy as
 * every other resource in this package.
 */

import type { GoldenRecordedToolCall } from "./golden-conversations";

export type PromptEvalRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "ABORTED";

export type PromptEvalAbortReason = "USER_REQUESTED" | "BUDGET_CAP";

export type PromptEvalCaseStatus = "PENDING" | "RUNNING" | "JUDGED" | "FAILED" | "SKIPPED";

export type PromptEvalVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type PromptEvalModelProvider = "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI" | "KIMI";

/** One prompt version in the comparison, snapshotted at creation. */
export interface PromptEvalRunCandidate {
  versionId: string;
  variantName: string;
  /** A COPY of the prompt as it stood; a later save does not change it. */
  promptText: string;
}

export interface PromptEvalRunSelectionEntry {
  conversationId: string;
  turnIndexes: number[];
}

export interface PromptEvalJudgeConfig {
  model: string;
  provider: PromptEvalModelProvider;
  repetitions: number;
}

/** Ten-thousandths of a USD: 1500 = $0.15. */
export interface PromptEvalRollupCost {
  totalUsdTenThousandths: number;
  generationUsdTenThousandths: number;
  judgeUsdTenThousandths: number;
}

export interface PromptEvalRollupConversation {
  conversationId: string;
  caseCount: number;
  meanScore: number | null;
  passRate: number | null;
}

/**
 * `meanScore` and `passRate` are null — never 0 — when nothing scored: no
 * measurement and a measured zero are opposite facts. `deltaVsBaseline` is
 * ABSENT on a run that chose no baseline.
 */
export interface PromptEvalRollupVariant {
  versionId: string;
  name: string;
  isBaseline: boolean;
  caseCount: number;
  scoredCaseCount: number;
  failedCaseCount: number;
  inconclusiveScoreCount: number;
  meanScore: number | null;
  passRate: number | null;
  deltaVsBaseline?: number;
  conversations: PromptEvalRollupConversation[];
  cost: PromptEvalRollupCost;
}

export interface PromptEvalRunRollup {
  variants: PromptEvalRollupVariant[];
  cost: PromptEvalRollupCost;
}

export interface PromptEvalRunCost extends PromptEvalRollupCost {
  inputTokens: number;
  outputTokens: number;
}

export interface PromptEvalRun {
  id: string;
  agentId: string;
  name: string | null;
  status: PromptEvalRunStatus;
  /** Set only when status is ABORTED. */
  abortReason: PromptEvalAbortReason | null;
  candidates: PromptEvalRunCandidate[];
  baselineVersionId: string | null;
  selection: PromptEvalRunSelectionEntry[];
  judgeConfig: PromptEvalJudgeConfig;
  /** Null until the run reaches a terminal status. */
  rollup: PromptEvalRunRollup | null;
  budgetCapUsdTenThousandths: number | null;
  cost: PromptEvalRunCost;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptEvalScore {
  id: string;
  caseId: string;
  /** "golden_match" (built-in) or a checkpoint's own criterion name. */
  criterion: string;
  /** 0..1. */
  score: number;
  verdict: PromptEvalVerdict;
  reasoning: string;
  model: string;
  repetition: number;
  createdAt: string;
}

export interface PromptEvalSnapshotPrefixTurn {
  role: "USER" | "AGENT";
  content: string;
}

/** The golden turn and its prefix, frozen when the run was created. */
export interface PromptEvalGoldenSnapshot {
  content: string;
  toolCalls: GoldenRecordedToolCall[];
  prefix: PromptEvalSnapshotPrefixTurn[];
}

export interface PromptEvalCaseCandidate {
  content: string;
  toolCalls: GoldenRecordedToolCall[];
  /** The ephemeral emulator session it ran in. */
  sessionId: string;
}

export interface PromptEvalCase {
  id: string;
  runId: string;
  versionId: string;
  /** Resolved off the run's candidate snapshot; null if the run no longer lists it. */
  variantName: string | null;
  conversationId: string;
  turnIndex: number;
  status: PromptEvalCaseStatus;
  /** Set only when the cell FAILED. */
  failureReason: string | null;
  latencyMs: number | null;
  costUsdTenThousandths: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptEvalCaseWithScores extends PromptEvalCase {
  scores: PromptEvalScore[];
}

export interface PromptEvalCaseDetail extends PromptEvalCaseWithScores {
  goldenSnapshot: PromptEvalGoldenSnapshot;
  candidate: PromptEvalCaseCandidate | null;
  /** The prompt text this cell ran under, off the run's snapshot. */
  promptText: string | null;
}

export interface PromptEvalJudgeOverride {
  model?: string;
  provider?: PromptEvalModelProvider;
  /** At most 5; above that the API refuses. */
  repetitions?: number;
}

export interface PromptEvalCheckpointSelection {
  conversationId: string;
  turnIndexes: number[];
}

export interface PreviewPromptEvalRunBody {
  /** All must be READY and belong to one agent. */
  conversationIds: string[];
  /** A conversation absent here contributes every checkpoint it carries. */
  checkpoints?: PromptEvalCheckpointSelection[];
  /** Variant refs (name, id, or "main") whose tips become the candidates. */
  variants: string[];
  /** "main", "none", or a variant ref. Absent = none, and then no deltas. */
  baseline?: string;
  judge?: PromptEvalJudgeOverride;
}

export interface CreatePromptEvalRunBody extends PreviewPromptEvalRunBody {
  name?: string;
  /** The run aborts once accrued cost reaches this. Absent = uncapped. */
  budgetCapUsdTenThousandths?: number;
}

export interface CreatePromptEvalRunResult {
  run: PromptEvalRun;
  /** A large matrix, or a run the queue refused. */
  warnings: string[];
}

export interface PromptEvalRunPreview {
  agentId: string;
  caseCount: number;
  candidates: PromptEvalRunCandidate[];
  selection: PromptEvalRunSelectionEntry[];
  warnings: string[];
}

export interface ListPromptEvalRunsParams {
  agentId?: string;
}

export interface PromptEvalRunResults {
  run: PromptEvalRun;
  /** Null until the run reaches a terminal status. */
  rollup: PromptEvalRunRollup | null;
  cases: PromptEvalCaseWithScores[];
}
