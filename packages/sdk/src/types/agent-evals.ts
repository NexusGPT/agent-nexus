import type { ModelProvider } from "./common";

/**
 * Agent conversation evaluations — the `/agent-evals` family.
 *
 * ## Two vocabularies for one domain, and why this file uses the second
 *
 * The v1 contract names every descriptor `ConversationEval*`
 * (`ConversationEvalRunCreate`, …) while every route it declares is under
 * `/agent-evals` and the CLI verb is `nexus agent-eval`. The names here follow
 * the ROUTE rather than the descriptor, because a consumer reads
 * `client.agentEvals.runs.create()` beside the path it calls, and because
 * `./evaluations.ts` already holds the unrelated AI-TASK evaluation surface
 * (`/evaluations`) — two families whose names would otherwise collide in a
 * barrel that is `export type *`.
 *
 * ## What is gated, and what is transcribed
 *
 * 🔴 THE TWO ARE NOT THE SAME AND THE DIFFERENCE IS NOT VISIBLE FROM A TYPE.
 *
 * - **Gated.** Every type reachable from a route that declares a `Response` is
 *   compared against that schema, field by field, by
 *   `./v1-response-types-match-the-contract.test.ts`. A rename on the server
 *   turns that file red. {@link AgentEvalRun}, {@link AgentEvalBatch},
 *   {@link AgentEvalTemplate}, {@link AgentEvalSchedule},
 *   {@link AgentEvalTrigger}, {@link AgentEvalWebhook} and
 *   {@link AgentEvalRunResults} are all in that set.
 * - **Transcribed.** {@link AgentEvalTranscriptTurn}, {@link AgentEvalScoreDiff}
 *   and the two acknowledgements are read off routes that declare
 *   `noResponse: {…}`. NOTHING compares them to anything. They are transcribed
 *   from the handler and the domain entity it returns, and they drift silently.
 *   Each carries its own note naming the file it was read from.
 *
 * 🚨 **`AgentEvalScoreDiff` is the worked example, and it cuts BOTH ways.**
 * Transcribing from an ungated handler records what the server sends — including
 * when what the server sends is a defect. `CompareRunsUseCase`'s `ScoreDiff`
 * value object spelled its two score fields `current` / `baseline` while
 * `ConversationEvalScoreDiffSchema` — wired as `CompareRun.Response` on the
 * INTERNAL contract, and therefore the declared shape of this very route — spelled
 * them `currentScore` / `baselineScore`. Both spellings shipped: the dashboard
 * parsed the response through that schema, `z.object` stripped the two unknown
 * keys, and every score column rendered blank.
 *
 * A transcription is faithful to the handler, never to the contract, and a route
 * declaring no response has nothing to tell the two apart. So transcribe — and
 * when the transcription disagrees with a schema that names the same route, treat
 * that as a defect to report rather than a naming quirk to preserve. The value
 * object now spells both fields the way the column, the entity, the published API
 * reference and this type do.
 */

// ============================================================================
// Enums
// ============================================================================

/** Where a run's conversation comes from: simulated by a tester, or an inbox chat. */
export type AgentEvalSourceMode = "SIMULATED" | "INBOX";

/** Lifecycle of an evaluation run. */
export type AgentEvalRunStatus =
  | "DRAFT"
  | "QUEUED"
  | "INGESTING"
  | "SIMULATING"
  | "SIMULATED"
  | "JUDGING"
  | "SUMMARIZING"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "BUDGET_EXCEEDED"
  | "ABORTED";

/** Which version of the target agent's prompt a run evaluates. */
export type AgentEvalTargetVersionMode = "DRAFT" | "PRODUCTION" | "PINNED";

/** A run's overall verdict once thresholds have been applied. */
export type AgentEvalVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

/** Why a run's conversation stopped. */
export type AgentEvalTerminationReason =
  | "TESTER_END_SIGNAL"
  | "MAX_TURNS"
  | "RUN_TIMEOUT"
  | "BUDGET_CAP"
  | "EMULATOR_FAILED"
  | "INBOX_INGESTED"
  | "ABORTED";

/** Who spoke a transcript turn. */
export type AgentEvalTurnRole = "TESTER" | "TARGET" | "USER" | "AGENT" | "SYSTEM";

/** What a template supplies to the pipeline. */
export type AgentEvalTemplateKind = "TESTER_PERSONA" | "JUDGE_RUBRIC" | "SUMMARY_PROMPT";

/** Whether a template is a platform seed or owned by one agent. */
export type AgentEvalTemplateScope = "GLOBAL" | "AGENT";

/** Whether a schedule's cron is firing. */
export type AgentEvalScheduleStatus = "ACTIVE" | "PAUSED";

/** Lifecycle of a batch of runs. */
export type AgentEvalBatchStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

/** What causes a trigger to start a run. */
export type AgentEvalTriggerKind = "AUTO_ON_CLOSE" | "SCHEDULED_SAMPLE";

/** Lifecycle of one judge repetition. */
export type AgentEvalJudgeRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "MALFORMED";

/** Events a completion webhook may subscribe to. */
export type AgentEvalWebhookEvent = "run.completed" | "run.failed" | "batch.completed";

// ============================================================================
// Frozen configuration snapshots (what a stored row carries)
// ============================================================================

/**
 * The tester persona a run was frozen with.
 *
 * A run stores the FULLY RESOLVED text, never a template reference to re-resolve
 * — that is what makes a run reproducible after its template is edited.
 */
export interface AgentEvalTesterConfigSnapshot {
  /** The template the prompt was resolved from, when one was used. */
  templateId?: string;
  /** The resolved tester system prompt, verbatim. */
  resolvedSystemPrompt: string;
  /** What the tester is trying to achieve in the conversation. */
  goal?: string;
  /** The string the tester emits to end the conversation. */
  endSignal: string;
  /** JSON-schema parameter map for the callable `end_conversation(...)`. */
  endConversationSchema?: Record<string, unknown> | null;
}

/**
 * One judge's frozen rubric.
 *
 * ⚠️ `provider` is a bare `string` here and a {@link ModelProvider} on the write
 * side ({@link AgentEvalJudgeConfigInput}). That asymmetry is deliberate in the
 * contract: these snapshots live in Prisma `Json` columns that no constraint has
 * ever bounded, so READING must never refuse a legacy row — one bad value would
 * otherwise break the whole organization's list page.
 */
export interface AgentEvalJudgeConfigSnapshot {
  /** The rubric template this was resolved from, when one was used. */
  templateId?: string;
  /** The named thing being scored. */
  criterion: string;
  /** The resolved rubric text, verbatim. */
  resolvedRubric: string;
  /** Provider that ran the judge. A stored value, not necessarily a current member. */
  provider: string;
  /** Model that ran the judge. */
  model: string;
  /** How many times the judge is re-run for agreement (1–20). */
  kRepetitions: number;
  /** JSON schema the judge's structured output must satisfy. */
  outputJsonSchema?: Record<string, unknown> | null;
}

/** The summariser's frozen prompt. Same read-side tolerance as the judge snapshot. */
export interface AgentEvalSummaryConfigSnapshot {
  /** The summary template this was resolved from, when one was used. */
  templateId?: string;
  /** The resolved summary prompt, verbatim. */
  resolvedPrompt: string;
  /** Provider that ran the summary. A stored value, not necessarily a current member. */
  provider: string;
  /** Model that ran the summary. */
  model: string;
}

/** The bar a run's scores must clear for a `PASS` verdict. */
export interface AgentEvalThresholdConfig {
  /** Minimum mean score across every criterion. */
  minOverallScore: number;
  /** Minimum mean score for any single criterion. */
  perCriterionMin?: number;
  /** Refuse a `PASS` when the judges disagreed too widely. */
  requireNoLowAgreement?: boolean;
}

// ============================================================================
// Configuration INPUTS (what a create body accepts)
// ============================================================================

/**
 * The tester persona a run is created with.
 *
 * Supply `templateId` and the server resolves the prompt, or supply
 * `resolvedSystemPrompt` inline. One of the two is required — the API refuses
 * a config carrying neither.
 */
export interface AgentEvalTesterConfigInput {
  /** Resolve the persona from this template. */
  templateId?: string;
  /** The tester system prompt, inline. Required when `templateId` is absent. */
  resolvedSystemPrompt?: string;
  /** What the tester is trying to achieve. */
  goal?: string;
  /** The string the tester emits to end the conversation. */
  endSignal?: string;
  /** JSON-schema parameter map for the callable `end_conversation(...)`. */
  endConversationSchema?: Record<string, unknown>;
}

/**
 * One judge, as a create body accepts it.
 *
 * Supply `templateId`, or supply `criterion`, `resolvedRubric`, `provider` and
 * `model` inline. The API refuses anything else.
 */
export interface AgentEvalJudgeConfigInput {
  /** Resolve the rubric from this template. */
  templateId?: string;
  /** The named thing being scored. Required when `templateId` is absent. */
  criterion?: string;
  /** The rubric text, inline. Required when `templateId` is absent. */
  resolvedRubric?: string;
  /**
   * Which provider runs the judge. Required when `templateId` is absent.
   *
   * The ENUM rather than a string, and this is the only boundary that checks it:
   * the dispatcher narrows a non-member onto the Anthropic adapter instead of
   * erroring, and the same value is written verbatim into a non-nullable Prisma
   * enum column.
   */
  provider?: ModelProvider;
  /** Which model runs the judge. Required when `templateId` is absent. */
  model?: string;
  /** How many times to re-run the judge for agreement (1–20). */
  kRepetitions?: number;
  /** JSON schema the judge's structured output must satisfy. */
  outputJsonSchema?: Record<string, unknown> | null;
}

/**
 * The summariser, as a create body accepts it.
 *
 * ⚠️ `provider` here also routes the TESTER simulation, which has no provider of
 * its own — one value decides two things.
 */
export interface AgentEvalSummaryConfigInput {
  /** Resolve the summary prompt from this template. */
  templateId?: string;
  /** The summary prompt, inline. Required when `templateId` is absent. */
  resolvedPrompt?: string;
  /** Which provider runs the summary AND the tester. Required when `templateId` is absent. */
  provider?: ModelProvider;
  /** Which model runs the summary. Required when `templateId` is absent. */
  model?: string;
}

/**
 * A judge config as a BATCH, SCHEDULE or TRIGGER accepts it — fully resolved.
 *
 * None of those three re-runs template resolution when a run is later
 * materialized, so the create call is the only moment the values can be checked
 * at all. That is why every field is required here and optional on
 * {@link AgentEvalJudgeConfigInput}, and why `provider` is the enum.
 */
export interface AgentEvalJudgeConfigSnapshotInput {
  /** The rubric template this was resolved from, when one was used. */
  templateId?: string;
  /** The named thing being scored. */
  criterion: string;
  /** The resolved rubric text, verbatim. */
  resolvedRubric: string;
  /** Which provider runs the judge. */
  provider: ModelProvider;
  /** Which model runs the judge. */
  model: string;
  /** How many times to re-run the judge for agreement (1–20). */
  kRepetitions: number;
  /** JSON schema the judge's structured output must satisfy. */
  outputJsonSchema?: Record<string, unknown> | null;
}

/** A summary config as a batch, schedule or trigger accepts it — fully resolved. */
export interface AgentEvalSummaryConfigSnapshotInput {
  /** The summary template this was resolved from, when one was used. */
  templateId?: string;
  /** The resolved summary prompt, verbatim. */
  resolvedPrompt: string;
  /** Which provider runs the summary AND the tester. */
  provider: ModelProvider;
  /** Which model runs the summary. */
  model: string;
}

// ============================================================================
// Runs
// ============================================================================

/**
 * One evaluation run.
 *
 * Every timestamp is an ISO 8601 string — the contract declares
 * `z.coerce.date()`, and what crosses the wire is its JSON form.
 */
export interface AgentEvalRun {
  /** Run UUID. */
  id: string;
  /** Human-readable run name. */
  name: string;
  /** Free-text description. */
  description?: string | null;
  /** Owning organization UUID. */
  organizationId: string;
  /** Simulated conversation, or an ingested inbox chat. */
  sourceMode: AgentEvalSourceMode;
  /** The agent under evaluation. */
  targetAgentId?: string | null;
  /** The deployment under evaluation. */
  targetDeploymentId?: string | null;
  /** Which of the target's prompt versions is evaluated. */
  targetVersionMode: AgentEvalTargetVersionMode;
  /** The pinned prompt version, when `targetVersionMode` is `"PINNED"`. */
  targetPromptVersionId?: string | null;
  /** The ingested inbox chat, when `sourceMode` is `"INBOX"`. */
  sourceChatId?: string | null;
  /** Where the run is in its lifecycle. */
  status: AgentEvalRunStatus;
  /** Why the conversation stopped. */
  terminationReason?: AgentEvalTerminationReason | null;
  /** The verdict once thresholds have been applied. */
  verdict?: AgentEvalVerdict | null;
  /** The judges this run was frozen with. */
  judgeConfigs: AgentEvalJudgeConfigSnapshot[];
  /** The summariser this run was frozen with. */
  summaryConfig: AgentEvalSummaryConfigSnapshot;
  /** The tester persona this run was frozen with. Absent for `"INBOX"` runs. */
  testerConfig?: AgentEvalTesterConfigSnapshot | null;
  /** Turn ceiling for the simulated conversation. */
  maxTurns: number;
  /** Wall-clock ceiling for the whole run, in milliseconds. */
  runTimeoutMs: number;
  /** Spend ceiling, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number | null;
  /** Total spend, in ten-thousandths of a USD cent. */
  totalCostUsdTenThousandths: number;
  /** Tester spend, in ten-thousandths of a USD cent. */
  testerCostUsdTenThousandths: number;
  /** Judge spend, in ten-thousandths of a USD cent. */
  judgeCostUsdTenThousandths: number;
  /** Summary spend, in ten-thousandths of a USD cent. */
  summaryCostUsdTenThousandths: number;
  /** Input tokens across the whole run. */
  totalInputTokens: number;
  /** Output tokens across the whole run. */
  totalOutputTokens: number;
  /** The bar this run's verdict was decided against. */
  thresholdConfig?: AgentEvalThresholdConfig | null;
  /** The run this one is compared against. */
  baselineRunId?: string | null;
  /** The schedule that materialized this run. */
  scheduleId?: string | null;
  /** The batch that fanned this run out. */
  batchId?: string | null;
  /** The webhook notified on completion. */
  webhookConfigId?: string | null;
  /** The generated summary prose. */
  summaryText?: string | null;
  /** The generated structured summary. */
  summaryJson?: unknown;
  /** Why the run failed, when it did. */
  errorMessage?: string | null;
  /** The LLM trace covering this run, for `client.tracing`. */
  llmTraceId?: string | null;
  /** Who started the run. */
  createdByUserId?: string | null;
  /** ISO 8601 timestamp the run started executing. */
  startedAt?: string | null;
  /** ISO 8601 timestamp the run finished. */
  completedAt?: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/** Request body for `client.agentEvals.runs.create()`. */
export interface CreateAgentEvalRunBody {
  /** Human-readable run name. */
  name: string;
  /** Free-text description. */
  description?: string;
  /** Simulate a conversation, or evaluate an existing inbox chat. */
  sourceMode: AgentEvalSourceMode;
  /** The agent to evaluate. */
  targetAgentId?: string;
  /** The deployment to evaluate. */
  targetDeploymentId?: string;
  /** Which of the target's prompt versions to evaluate. */
  targetVersionMode?: AgentEvalTargetVersionMode;
  /** The prompt version to pin, with `targetVersionMode: "PINNED"`. */
  targetPromptVersionId?: string;
  /** The inbox chat to ingest, with `sourceMode: "INBOX"`. */
  sourceChatId?: string;
  /** The tester persona. Not used for `"INBOX"` runs. */
  testerConfig?: AgentEvalTesterConfigInput;
  /** At least one judge. */
  judgeConfigs: AgentEvalJudgeConfigInput[];
  /** The summariser — and, for a simulated run, the tester's provider too. */
  summaryConfig: AgentEvalSummaryConfigInput;
  /** Turn ceiling for the simulated conversation (1–200). */
  maxTurns?: number;
  /** Wall-clock ceiling for the whole run, in milliseconds (minimum 1000). */
  runTimeoutMs?: number;
  /** Spend ceiling, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number;
  /** The bar the verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig;
  /** A previous run to compare against. */
  baselineRunId?: string;
  /** A webhook to notify on completion. */
  webhookConfigId?: string;
}

/** Query parameters for `client.agentEvals.runs.list()`. */
export interface ListAgentEvalRunsParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
  /** Only runs in this state. */
  status?: AgentEvalRunStatus;
  /** Only runs targeting this agent. */
  agentId?: string;
  /** Only simulated, or only inbox-sourced, runs. */
  sourceMode?: AgentEvalSourceMode;
}

/** One judge repetition's score for one criterion. */
export interface AgentEvalJudgeResult {
  /** Judge-result UUID. */
  id: string;
  /** The run this result belongs to. */
  runId: string;
  /** The named thing that was scored. */
  criterion: string;
  /** The rubric template used, when one was. */
  judgeTemplateId?: string | null;
  /** Provider that ran this judge. */
  provider: ModelProvider;
  /** Model that ran this judge. */
  model: string;
  /** Which repetition this is, 0-based. */
  repetitionIndex: number;
  /** Whether this repetition produced a usable score. */
  status: AgentEvalJudgeRunStatus;
  /** The score, when the repetition succeeded. */
  score?: number | null;
  /** The judge's reasoning. */
  explanation?: string | null;
  /** The judge's structured output, when `outputJsonSchema` was set. */
  structuredJson?: unknown;
  /** Why this repetition failed, when it did. */
  errorMessage?: string | null;
  /** Spend for this repetition, in ten-thousandths of a USD cent. */
  costUsdTenThousandths: number;
  /** How long this repetition took. */
  latencyMs?: number | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** The aggregate of every repetition for one criterion. */
export interface AgentEvalCriterionRollup {
  /** Rollup UUID. */
  id: string;
  /** The run this rollup belongs to. */
  runId: string;
  /** The named thing that was scored. */
  criterion: string;
  /** Mean score across repetitions. */
  meanScore?: number | null;
  /** Standard deviation across repetitions — how much the judges disagreed. */
  stdDev?: number | null;
  /** Lowest score across repetitions. */
  minScore?: number | null;
  /** Highest score across repetitions. */
  maxScore?: number | null;
  /** How many repetitions produced a score. */
  sampleCount: number;
  /** Whether the judges disagreed too widely to trust the mean. */
  lowAgreement: boolean;
  /** Confidence in the mean. */
  confidence?: number | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** A stored per-criterion delta against this run's baseline. */
export interface AgentEvalBaselineDiff {
  /** Diff UUID. */
  id: string;
  /** The run this diff belongs to. */
  runId: string;
  /** The run it was compared against. */
  baselineRunId: string;
  /** The named thing that was scored. */
  criterion: string;
  /** This run's mean score. */
  currentScore?: number | null;
  /** The baseline run's mean score. */
  baselineScore?: number | null;
  /** `currentScore - baselineScore`. */
  delta?: number | null;
  /** Whether this criterion got worse. */
  regressed: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Everything `client.agentEvals.runs.results()` returns. */
export interface AgentEvalRunResults {
  /** The run itself. */
  run: AgentEvalRun;
  /** Every judge repetition. */
  judgeResults: AgentEvalJudgeResult[];
  /** One aggregate per criterion. */
  rollups: AgentEvalCriterionRollup[];
  /** The stored comparison against this run's baseline. */
  baselineDiffs: AgentEvalBaselineDiff[];
}

/**
 * One turn of an evaluated conversation.
 *
 * 🔴 **UNGATED, and transcribed rather than derived.** `GET /agent-evals/runs/
 * :id/transcript` declares `noResponse`, so no contract-derived gate compares
 * this to anything. It is read from the entity the handler actually returns —
 * `ConversationEvalTurn` in
 * `apps/backend/src/tools/ai-tasks/conversation-eval/domain/entities/conversation-eval-turn.entity.ts`
 * — as that entity survives JSON.
 *
 * ⚠️ Note the difference from the `ConversationEvalTurnSchema` that `@nexus/types`
 * exports for the same concept: the schema says `.nullish()` on the optional
 * fields, the ENTITY says `?: string` with no null, and it is the entity that
 * ships. `JSON.stringify` drops an `undefined` key, so a field that is not set
 * is ABSENT rather than `null`.
 */
export interface AgentEvalTranscriptTurn {
  /** Turn UUID. */
  id: string;
  /** The run this turn belongs to. */
  runId: string;
  /** Position in the conversation, 0-based. */
  turnIndex: number;
  /** Who spoke. */
  role: AgentEvalTurnRole;
  /** Display name for the speaker. */
  speakerLabel?: string;
  /** What was said. */
  content: string;
  /** The emulator chat this turn was produced in. */
  emulatorChatId?: string;
  /** The emulator message this turn came from. */
  emulatorMessageId?: string;
  /** The inbox message this turn was ingested from. */
  sourceMessageId?: string;
  /** The emulator's own status for this turn. */
  emulatorRunStatus?: string;
  /** The model that produced this turn. */
  modelUsed?: string;
  /** Tokens spent producing this turn. */
  tokensUsed?: number;
  /** How long this turn took. */
  latencyMs?: number;
  /** Tools the agent called during this turn. */
  toolsInvoked?: unknown;
  /** Whether this turn ended the conversation. */
  isEndSignal: boolean;
  /** Structured params passed to the callable `end_conversation(...)`. */
  endConversationParams?: unknown;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * One criterion's delta, as `client.agentEvals.runs.compare()` returns it.
 *
 * 🔴 **UNGATED.** `GET /agent-evals/runs/:id/compare` declares `noResponse` and
 * the handler returns `CompareRunsUseCase`'s `ScoreDiff[]` untouched — the value
 * object in
 * `apps/backend/src/tools/ai-tasks/conversation-eval/domain/value-objects/score-diff.vo.ts`.
 * So `./v1-response-types-match-the-contract.test.ts` does not reach this type and
 * a server-side rename cannot turn it red. Read the value object before changing
 * a field below.
 *
 * The names match `ConversationEvalScoreDiffSchema`, which is a DIFFERENT schema
 * from {@link AgentEvalBaselineDiff}'s: that one describes the STORED
 * `ConversationEvalBaselineDiff` row and carries a `createdAt`; this one is wired
 * as `CompareRun.Response` on the internal contract and describes exactly this
 * computed payload. The two schemas are neighbours in one file and are easy to
 * mistake for each other.
 *
 * Every score is nullable and never absent: the diff covers the UNION of criteria
 * across the two runs, so a criterion present on one side only carries an explicit
 * `null` for the other.
 */
export interface AgentEvalScoreDiff {
  /** The named thing that was scored. */
  criterion: string;
  /** This run's mean score, or `null` when this run has no score for it. */
  currentScore: number | null;
  /** The baseline run's mean score, or `null` when the baseline has none. */
  baselineScore: number | null;
  /** `currentScore - baselineScore`, or `null` when either side is missing. */
  delta: number | null;
  /** Whether this criterion got worse. */
  regressed: boolean;
}

/**
 * The acknowledgement `execute` and `abort` return.
 *
 * 🔴 **UNGATED.** Both routes declare `noResponse`; the literal is built in
 * `V1ConversationEvalsController` and no schema describes it. The status is the
 * one the controller writes, which is why it is a literal union and not
 * {@link AgentEvalRunStatus} — the route cannot answer anything else.
 */
export interface AgentEvalRunAcknowledgement {
  /** The run the call acted on. */
  id: string;
  /** `"QUEUED"` from `execute()`, `"ABORTED"` from `abort()`. */
  status: "QUEUED" | "ABORTED";
}

// ============================================================================
// Batches
// ============================================================================

/** Which stored conversations a batch fans out over. */
export interface AgentEvalBatchFilter {
  /** Only conversations handled by this agent. */
  agentId?: string;
  /** Only conversations on this deployment. */
  deploymentId?: string;
  /** Only conversations inside this window. */
  dateRange?: {
    /** Inclusive lower bound. */
    from?: string;
    /** Inclusive upper bound. */
    to?: string;
  };
  /** Only conversations on this channel. */
  channel?: string;
  /** Only conversations carrying this tag. */
  tag?: string;
  /** Only conversations in this state. */
  status?: string;
  /** Cap on how many conversations are selected (1–1000). */
  limit?: number;
}

/** A fan-out of one evaluation recipe over many stored conversations. */
export interface AgentEvalBatch {
  /** Batch UUID. */
  id: string;
  /** Owning organization UUID. */
  organizationId: string;
  /** Human-readable batch name. */
  name: string;
  /** Which conversations this batch selected. */
  filterJson: AgentEvalBatchFilter;
  /** Where the batch is in its lifecycle. */
  status: AgentEvalBatchStatus;
  /** How many runs the fan-out created. */
  totalRuns: number;
  /** How many of those have finished. */
  completedRuns: number;
  /** How many of those failed. */
  failedRuns: number;
  /** Aggregate scores across the batch. */
  aggregateJson?: unknown;
  /** The judges every child run was frozen with. */
  judgeConfigs: AgentEvalJudgeConfigSnapshot[];
  /** The summariser every child run was frozen with. */
  summaryConfig: AgentEvalSummaryConfigSnapshot;
  /** The bar every child run's verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig | null;
  /** Spend ceiling, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number | null;
  /** Who started the batch. */
  createdByUserId?: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/**
 * Request body for `client.agentEvals.batches.create()`.
 *
 * The configs are FULLY RESOLVED snapshots, not the template-resolving inputs a
 * single run accepts: the fan-out copies them onto every child run verbatim and
 * never resolves a template again.
 */
export interface CreateAgentEvalBatchBody {
  /** Human-readable batch name. */
  name: string;
  /** Which stored conversations to fan out over. */
  filterJson: AgentEvalBatchFilter;
  /** At least one fully-resolved judge. */
  judgeConfigs: AgentEvalJudgeConfigSnapshotInput[];
  /** The fully-resolved summariser. */
  summaryConfig: AgentEvalSummaryConfigSnapshotInput;
  /** The bar every child run's verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig;
  /** Spend ceiling, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number;
}

/** Query parameters for `client.agentEvals.batches.list()`. */
export interface ListAgentEvalBatchesParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
  /** Only batches in this state. */
  status?: AgentEvalBatchStatus;
}

// ============================================================================
// Templates
// ============================================================================

/** A reusable tester persona, judge rubric, or summary prompt. */
export interface AgentEvalTemplate {
  /** Template UUID. */
  id: string;
  /** What this template supplies to the pipeline. */
  kind: AgentEvalTemplateKind;
  /** A platform seed, or one agent's own. */
  scope: AgentEvalTemplateScope;
  /** Owning organization UUID. Absent on a `"GLOBAL"` seed. */
  organizationId?: string | null;
  /** The agent that owns this template. Absent on a `"GLOBAL"` seed. */
  ownerAgentId?: string | null;
  /** Human-readable template name. */
  name: string;
  /** Free-text description. */
  description?: string | null;
  /** For a `"JUDGE_RUBRIC"`, the named thing it scores. */
  criterion?: string | null;
  /** For a `"TESTER_PERSONA"`, what the tester is trying to achieve. */
  goal?: string | null;
  /** The prompt body. */
  systemPrompt: string;
  /** For a `"TESTER_PERSONA"`, the string that ends the conversation. */
  endSignal?: string | null;
  /** JSON-schema parameter map for the callable `end_conversation(...)`. */
  endConversationSchema?: Record<string, unknown> | null;
  /** For a `"JUDGE_RUBRIC"`, the schema its structured output must satisfy. */
  outputJsonSchema?: Record<string, unknown> | null;
  /** Provider used when this template is resolved without an explicit one. */
  defaultProvider?: ModelProvider | null;
  /** Model used when this template is resolved without an explicit one. */
  defaultModel?: string | null;
  /** Whether this is a platform-shipped seed. */
  isSeed: boolean;
  /** The template this was cloned from. */
  clonedFromId?: string | null;
  /** Bumped on every edit. */
  version: number;
  /** Who created the template. */
  createdByUserId?: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/** Request body for `client.agentEvals.templates.create()`. */
export interface CreateAgentEvalTemplateBody {
  /** The agent that will own the template. Templates are agent-scoped. */
  agentId: string;
  /** What this template supplies to the pipeline. */
  kind: AgentEvalTemplateKind;
  /** Human-readable template name. */
  name: string;
  /** Free-text description. */
  description?: string;
  /** For a `"JUDGE_RUBRIC"`, the named thing it scores. */
  criterion?: string;
  /** For a `"TESTER_PERSONA"`, what the tester is trying to achieve. */
  goal?: string;
  /** The prompt body. */
  systemPrompt: string;
  /** For a `"TESTER_PERSONA"`, the string that ends the conversation. */
  endSignal?: string;
  /** JSON-schema parameter map for the callable `end_conversation(...)`. */
  endConversationSchema?: Record<string, unknown> | null;
  /** For a `"JUDGE_RUBRIC"`, the schema its structured output must satisfy. */
  outputJsonSchema?: Record<string, unknown> | null;
  /** Provider used when this template is resolved without an explicit one. */
  defaultProvider?: ModelProvider;
  /** Model used when this template is resolved without an explicit one. */
  defaultModel?: string;
}

/**
 * Request body for `client.agentEvals.templates.update()`. Only the fields you
 * send are written.
 *
 * ⚠️ `endConversationSchema` and `outputJsonSchema` distinguish `null` from
 * absent: `null` CLEARS the stored value, omitting the key leaves it untouched.
 *
 * ⚠️ `defaultProvider` is a bare `string` here and a {@link ModelProvider} on
 * {@link CreateAgentEvalTemplateBody}. That is the contract's own asymmetry —
 * `UpdateConversationEvalTemplateBodySchema` declares `z.string().optional()`
 * where the create body declares the enum. Narrowing it here would refuse a
 * value the API accepts.
 */
export interface UpdateAgentEvalTemplateBody {
  /** Human-readable template name. */
  name?: string;
  /** Free-text description. */
  description?: string;
  /** For a `"JUDGE_RUBRIC"`, the named thing it scores. */
  criterion?: string;
  /** For a `"TESTER_PERSONA"`, what the tester is trying to achieve. */
  goal?: string;
  /** The prompt body. */
  systemPrompt?: string;
  /** For a `"TESTER_PERSONA"`, the string that ends the conversation. */
  endSignal?: string;
  /** `null` clears the stored schema; omitting the key leaves it untouched. */
  endConversationSchema?: Record<string, unknown> | null;
  /** `null` clears the stored schema; omitting the key leaves it untouched. */
  outputJsonSchema?: Record<string, unknown> | null;
  /** Provider used when this template is resolved without an explicit one. */
  defaultProvider?: string;
  /** Model used when this template is resolved without an explicit one. */
  defaultModel?: string;
}

/** Request body for `client.agentEvals.templates.clone()`. */
export interface CloneAgentEvalTemplateBody {
  /** The agent that will own the copy. */
  agentId: string;
  /** Name for the copy. Defaults to the original's, when omitted. */
  name?: string;
}

/** Request body for `client.agentEvals.templates.attach()`. */
export interface AttachAgentEvalTemplateBody {
  /** The agent to attach this existing template to. */
  agentId: string;
}

/** Query parameters for `client.agentEvals.templates.list()`. */
export interface ListAgentEvalTemplatesParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
  /** Scope the listing to global seeds plus the templates attached to this agent. */
  agentId?: string;
  /** Only templates of this kind. */
  kind?: AgentEvalTemplateKind;
  /** Only global seeds, or only agent-owned templates. */
  scope?: AgentEvalTemplateScope;
}

/**
 * Query parameters for `client.agentEvals.templates.listImportable()`.
 *
 * `agentId` is REQUIRED — the picker answers "what could this agent import",
 * which has no agent-less spelling.
 */
export interface ListImportableAgentEvalTemplatesParams {
  /** The agent the templates would be imported ONTO. Required. */
  agentId: string;
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
  /** Only templates of this kind. */
  kind?: AgentEvalTemplateKind;
}

// ============================================================================
// Schedules
// ============================================================================

/**
 * The frozen run recipe a schedule materializes on every cron tick.
 *
 * It is the create-run body minus `sourceMode` (which lives on the schedule
 * row), with `name` optional, and with FULLY RESOLVED configs — the processor
 * bypasses template resolution, so a template reference here would never be
 * resolved.
 */
export interface AgentEvalScheduleRunConfig {
  /** Name for each materialized run. The processor names them when omitted. */
  name?: string;
  /** Free-text description. */
  description?: string;
  /** The agent to evaluate. */
  targetAgentId?: string;
  /** The deployment to evaluate. */
  targetDeploymentId?: string;
  /** Which of the target's prompt versions to evaluate. */
  targetVersionMode?: AgentEvalTargetVersionMode;
  /** The prompt version to pin, with `targetVersionMode: "PINNED"`. */
  targetPromptVersionId?: string;
  /** The inbox chat to ingest, for an `"INBOX"` schedule. */
  sourceChatId?: string;
  /** The fully-resolved tester persona. */
  testerConfig?: AgentEvalTesterConfigSnapshot;
  /** At least one fully-resolved judge. */
  judgeConfigs: AgentEvalJudgeConfigSnapshotInput[];
  /** The fully-resolved summariser. */
  summaryConfig: AgentEvalSummaryConfigSnapshotInput;
  /** Turn ceiling for the simulated conversation (1–200). */
  maxTurns?: number;
  /** Wall-clock ceiling for each run, in milliseconds (minimum 1000). */
  runTimeoutMs?: number;
  /** Spend ceiling per run, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number;
  /** The bar each run's verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig;
  /** A previous run to compare each tick against. */
  baselineRunId?: string;
  /** A webhook to notify on each run's completion. */
  webhookConfigId?: string;
}

/**
 * A cron that materializes an evaluation run on every tick.
 *
 * ⚠️ `runConfig` is `unknown` because the contract declares it `z.unknown()` on
 * the RESPONSE — the column is Prisma `Json` and nothing bounds what a stored
 * row holds. It is {@link AgentEvalScheduleRunConfig} on the write side, where
 * it IS checked. Narrow a read with a parse of your own, never with a cast.
 */
export interface AgentEvalSchedule {
  /** Schedule UUID. */
  id: string;
  /** Owning organization UUID. */
  organizationId: string;
  /** Whether each tick simulates a conversation or ingests an inbox chat. */
  sourceMode: AgentEvalSourceMode;
  /**
   * The frozen run recipe. See the note above on why this is `unknown`.
   *
   * REQUIRED and not `?:`. A bare `z.unknown()` keeps its key required; only
   * `.nullish()` makes one optional, which is why {@link AgentEvalRun.summaryJson}
   * beside it IS optional. The server always sends this key.
   */
  runConfig: unknown;
  /** The cron expression. */
  cronExpression: string;
  /** The timezone the cron is read in. */
  timezone: string;
  /** Whether the cron is firing. */
  status: AgentEvalScheduleStatus;
  /** The queue job backing this schedule. */
  bullJobId?: string | null;
  /** The webhook notified on each run's completion. */
  webhookConfigId?: string | null;
  /** The run each tick is compared against. */
  baselineRunId?: string | null;
  /** The most recent run this schedule created. */
  lastRunId?: string | null;
  /** ISO 8601 timestamp of the most recent tick. */
  lastRunAt?: string | null;
  /** ISO 8601 timestamp of the next tick. */
  nextRunAt?: string | null;
  /** Who created the schedule. */
  createdByUserId?: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/** Request body for `client.agentEvals.schedules.create()`. */
export interface CreateAgentEvalScheduleBody {
  /** Whether each tick simulates a conversation or ingests an inbox chat. */
  sourceMode: AgentEvalSourceMode;
  /** The frozen run recipe each tick materializes. */
  runConfig: AgentEvalScheduleRunConfig;
  /** The cron expression. */
  cronExpression: string;
  /** The timezone to read the cron in. */
  timezone?: string;
  /** A webhook to notify on each run's completion. */
  webhookConfigId?: string;
  /** A run to compare each tick against. */
  baselineRunId?: string;
}

/** Request body for `client.agentEvals.schedules.update()`. Only the fields you send are written. */
export interface UpdateAgentEvalScheduleBody {
  /** Pause or resume the cron. */
  status?: AgentEvalScheduleStatus;
  /** The cron expression. */
  cronExpression?: string;
  /** The timezone to read the cron in. */
  timezone?: string;
  /** Replace the frozen run recipe wholesale. */
  runConfig?: AgentEvalScheduleRunConfig;
}

/** Query parameters for `client.agentEvals.schedules.list()`. */
export interface ListAgentEvalSchedulesParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
  /** Only schedules in this state. */
  status?: AgentEvalScheduleStatus;
}

// ============================================================================
// Triggers
// ============================================================================

/** An opt-in rule that starts an evaluation run without anyone asking. */
export interface AgentEvalTrigger {
  /** Trigger UUID. */
  id: string;
  /** Owning organization UUID. */
  organizationId: string;
  /** Only conversations handled by this agent fire the trigger. */
  agentId?: string | null;
  /** Only conversations on this deployment fire the trigger. */
  deploymentId?: string | null;
  /** What causes the trigger to fire. */
  kind: AgentEvalTriggerKind;
  /** Whether the trigger is armed. Defaults to `false` — this surface is opt-in. */
  enabled: boolean;
  /** The judges each triggered run is frozen with. */
  judgeConfigs: AgentEvalJudgeConfigSnapshot[];
  /** The summariser each triggered run is frozen with. */
  summaryConfig: AgentEvalSummaryConfigSnapshot;
  /** The bar each triggered run's verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig | null;
  /** Spend ceiling per run, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number | null;
  /** Fraction of eligible conversations to evaluate, 0–1. */
  sampleRate?: number | null;
  /** The webhook notified on each run's completion. */
  webhookConfigId?: string | null;
  /** Who created the trigger. */
  createdByUserId?: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/**
 * Request body for `client.agentEvals.triggers.upsert()`.
 *
 * ⚠️ `judgeConfigs[].provider` and `summaryConfig.provider` are bare `string`s
 * here, where the batch and schedule twins take the enum. That asymmetry is the
 * contract's, and it is a known gap rather than a decision that this door is
 * safe: an `AUTO_ON_CLOSE` trigger is the one unattended producer whose create
 * door does not check the provider, and a non-member stored here is re-read on
 * every fire. Send a {@link ModelProvider} value even though the type permits
 * more.
 */
export interface UpsertAgentEvalTriggerBody {
  /** Fire only for conversations handled by this agent. */
  agentId?: string;
  /** Fire only for conversations on this deployment. */
  deploymentId?: string;
  /** What causes the trigger to fire. */
  kind: AgentEvalTriggerKind;
  /** Arm the trigger. Defaults to `false`. */
  enabled?: boolean;
  /** At least one fully-resolved judge. */
  judgeConfigs: AgentEvalJudgeConfigSnapshot[];
  /** The fully-resolved summariser. */
  summaryConfig: AgentEvalSummaryConfigSnapshot;
  /** The bar each triggered run's verdict is decided against. */
  thresholdConfig?: AgentEvalThresholdConfig;
  /** Spend ceiling per run, in ten-thousandths of a USD cent. */
  budgetCapUsdTenThousandths?: number;
  /** Fraction of eligible conversations to evaluate, 0–1. */
  sampleRate?: number;
  /** A webhook to notify on each run's completion. */
  webhookConfigId?: string;
}

/** Query parameters for `client.agentEvals.triggers.list()`. */
export interface ListAgentEvalTriggersParams {
  /** Only triggers scoped to this agent. */
  agentId?: string;
  /** Only triggers scoped to this deployment. */
  deploymentId?: string;
  /** Only triggers of this kind. */
  kind?: AgentEvalTriggerKind;
  /** Only armed triggers. */
  enabledOnly?: boolean;
}

// ============================================================================
// Webhooks
// ============================================================================

/** Where completion notifications are POSTed. */
export interface AgentEvalWebhook {
  /** Webhook-config UUID. */
  id: string;
  /** Owning organization UUID. */
  organizationId: string;
  /** The endpoint notifications are POSTed to. */
  url: string;
  /** The signing secret. Redacted on read. */
  secret?: string | null;
  /**
   * The events this webhook subscribes to.
   *
   * `string[]` and not `AgentEvalWebhookEvent[]`: the contract's RESPONSE
   * declares `z.array(z.string())` while its write body declares the enum, so a
   * stored row may carry a value this SDK's union does not name. Narrowing the
   * read would refuse a row the server serves.
   */
  events: string[];
  /** Whether notifications are being sent. */
  isActive: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/**
 * Request body for `client.agentEvals.webhooks.upsert()`.
 *
 * ⚠️ The API refuses a `url` that resolves into a private network — loopback,
 * private and link-local ranges and internal hostnames are all rejected, because
 * the backend POSTs to this URL server-side.
 */
export interface UpsertAgentEvalWebhookBody {
  /** A public http(s) endpoint. */
  url: string;
  /** Signing secret for the delivered payloads. */
  secret?: string;
  /** At least one event to subscribe to. */
  events: AgentEvalWebhookEvent[];
  /** Whether to start sending notifications. Defaults to `true`. */
  isActive?: boolean;
}
