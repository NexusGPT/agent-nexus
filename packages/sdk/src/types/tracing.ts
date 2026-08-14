import type { ModelProvider } from "./common";

// ── Trace ──

/**
 * The surface a trace was started from.
 *
 * `agent-creation` and `ai-task-creation` are two rows, not a rename: ai-task
 * creation used to record its thread under the agent-creation key, so historical
 * rows keep answering the old filter while new ones carry the correct key.
 */
export type TraceSource =
  | "chatId"
  | "ultimate-cue"
  | "workflow"
  | "voice-relay"
  | "agent-creation"
  | "prompt-assistant"
  | "ai-task-creation";

/** Who or what started a trace. */
export interface IdentityRef {
  id: string;
  name: string | null;
  email: string | null;
}

export interface TraceSummary {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  agentId: string | null;
  agentName: string | null;
  workflowId: string | null;
  workflowName: string | null;
  conversationId: string | null;
  /** Surface the trace was started from. Null on rows recorded before attribution. */
  source: TraceSource | null;
  totalCostUsd: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalDurationMs: number | null;
  generationCount: number;
  startedAt: string | null;
  completedAt: string | null;
  /** Free-form attribution tags. Empty array when none were recorded. */
  tags: string[];
  /** The identity that started the trace, when one was attributed. */
  triggeredBy: IdentityRef | null;
}

export interface TraceDetail extends TraceSummary {
  executionId: string | null;
  generations: GenerationSummary[];
}

// ── Generation ──

export interface GenerationSummary {
  id: string;
  traceId: string;
  provider: ModelProvider;
  modelName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  /** Prompt tokens served from the provider's cache. A cost input. */
  cacheReadInputTokens: number | null;
  /** Prompt tokens written into the provider's cache. A cost input. */
  cacheCreationInputTokens: number | null;
  /** Tokens spent on reasoning, for models that bill them separately. */
  reasoningTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  /** Time spent reasoning before the first output token. */
  thinkingDurationMs: number | null;
  /** Time to first token, in milliseconds. */
  ttftMs: number | null;
  /** Time from the first token to the last, in milliseconds. */
  streamDurationMs: number | null;
  taskId: string | null;
  taskName: string | null;
  nodeId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  /** True when the caller cut the stream before the provider finished. */
  isAborted: boolean;
  temperature: number | null;
  /**
   * The provider's own stop reason, passed through verbatim — Anthropic
   * `end_turn`, OpenAI `stop`, Google `STOP`. Not normalized across providers.
   */
  finishReason: string | null;
  /** The provider's id for this response, when it returned one. */
  responseId: string | null;
}

export interface GenerationDetail extends GenerationSummary {
  systemPrompt: string | null;
  /**
   * The conversation as it was sent. The contract promises an array and nothing
   * about each element's shape, so these are `unknown` rather than a record —
   * the message shape is the provider's, and it differs between them.
   */
  messages: unknown[] | null;
  tools: unknown[] | null;
  response: string | null;
  responseJson: unknown;
}

// ── Analytics ──

export interface TracingSummary {
  totalTraces: number;
  completedTraces: number;
  failedTraces: number;
  inProgressTraces: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number | null;
  distinctModelCount: number;
  /**
   * How many generations in this window could not be priced, and are therefore
   * absorbed into `totalCostUsd` as zero-cost calls.
   *
   * `totalCostUsd` keeps its exact meaning — the sum of every cost that was
   * measured — and is NOT corrected by this field. A non-zero count means
   * `totalCostUsd` is LOW by an unknown amount. `0` is the normal answer.
   */
  unpricedGenerationCount: number;
  previousPeriod: {
    totalTraces: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } | null;
}

/** Dimensions a cost breakdown can group by. */
export type CostBreakdownGroupBy =
  | "model"
  | "agent"
  | "workflow"
  // FK-enforced attribution dimensions. "workflow" groups by workflow
  // definition; "workflowExecution" by a single run.
  | "deployment"
  | "customer"
  | "workflowExecution";

/** Time-bucket granularity shared by the timeline and cost-breakdown bucketing. */
export type TimelineGranularity = "hour" | "day" | "week";

export interface CostBreakdownEntry {
  /**
   * Single-dimension: the dimension value (e.g. a deployment id). Multi-dimension:
   * a composite `value0|value1[|value2]` key, unique per combination (excludes the
   * bucket — buckets share a groupKey, see `bucket`).
   */
  groupKey: string;
  /** Single-dimension display label; for multi-dimension see `groupLabels`. */
  groupLabel: string | null;
  /** Multi-dimension only: named per-dimension keys, e.g. `{ deployment, agent }`. */
  groupKeys?: Record<string, string>;
  /** Multi-dimension only: named per-dimension labels (null when unresolved). */
  groupLabels?: Record<string, string | null>;
  /** ISO timestamp of the bucket start when `bucket` was requested; null otherwise. */
  bucket: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  traceCount: number;
  generationCount: number;
  /**
   * How many of this entry's `generationCount` calls could not be priced, and
   * are therefore absorbed into this entry's `totalCostUsd` as zero-cost calls.
   *
   * Computed in the same query and the same GROUP BY as `generationCount`, so
   * `unpricedGenerationCount <= generationCount` always holds. A non-zero value
   * means this group's `totalCostUsd` is LOW by an unknown amount — the field
   * discloses that, it does not correct it.
   *
   * `0` is the normal answer: every call in this group had a price.
   */
  unpricedGenerationCount: number;
}

export interface CostBreakdown {
  /** Echoes the requested dimensions in order. Length 1 = single-dimension. */
  dimensions: CostBreakdownGroupBy[];
  entries: CostBreakdownEntry[];
}

export interface TimelinePoint {
  date: string;
  traceCount: number;
  generationCount: number;
  /**
   * How many of this bucket's `generationCount` calls could not be priced, and
   * are therefore absorbed into this bucket's `totalCostUsd` as zero-cost calls.
   *
   * Same population as `generationCount` — one query, one GROUP BY. An unpriced
   * model arriving mid-window makes the cost series FLATTEN rather than break,
   * and nothing else on a point distinguishes that from real spend stopping.
   */
  unpricedGenerationCount: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number | null;
}

export interface Timeline {
  points: TimelinePoint[];
}

// ── Export ──

export interface TraceExport {
  content: string;
  contentType: string;
  filename: string;
}

// ── Params ──

export interface ListTracesParams {
  page?: number;
  limit?: number;
  status?: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  agentId?: string;
  workflowId?: string;
  conversationId?: string;
  /** Filter by model name (max 255 characters). */
  model?: string;
  /** ISO 8601 date string (e.g. "2026-03-01" or "2026-03-01T00:00:00Z"). */
  startDate?: string;
  /** ISO 8601 date string (e.g. "2026-03-01" or "2026-03-01T00:00:00Z"). */
  endDate?: string;
  sortBy?: "startedAt" | "totalCostUsd" | "totalDurationMs";
  order?: "asc" | "desc";
}

export interface ListGenerationsParams {
  page?: number;
  limit?: number;
  traceId?: string;
  provider?: ModelProvider;
  /** Filter by model name (max 255 characters). */
  modelName?: string;
  status?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  agentId?: string;
  taskId?: string;
  /** ISO 8601 date string (e.g. "2026-03-01" or "2026-03-01T00:00:00Z"). */
  startDate?: string;
  /** ISO 8601 date string (e.g. "2026-03-01" or "2026-03-01T00:00:00Z"). */
  endDate?: string;
  minCostUsd?: number;
  maxCostUsd?: number;
  sortBy?: "startedAt" | "costUsd" | "durationMs";
  order?: "asc" | "desc";
}

export interface AnalyticsSummaryParams {
  startDate?: string;
  endDate?: string;
}

export interface CostBreakdownParams {
  startDate?: string;
  endDate?: string;
  /**
   * One to three dimensions. A single value is the legacy single-dimension
   * breakdown; two or three cross-tabulate (one row per combination) and are
   * restricted to trace-grain dimensions — `model` is generation-grain and is
   * rejected with 400 when combined with any other dimension. Defaults to
   * `"model"` server-side when omitted.
   */
  groupBy?: CostBreakdownGroupBy | CostBreakdownGroupBy[];
  /**
   * Optional time bucketing: one entry per (group key × bucket). Supported only
   * when every requested dimension is an FK attribution dimension
   * (`deployment`, `customer`, `workflowExecution`); `model`/`agent`/`workflow`
   * reject it with 400 — use {@link TracingResource.getTimeline} for org-wide series.
   */
  bucket?: TimelineGranularity;
}

export interface TimelineParams {
  startDate?: string;
  endDate?: string;
  granularity?: TimelineGranularity;
}

export interface ExportTraceParams {
  format?: "json" | "csv";
}

export interface BulkExportParams {
  format?: "json" | "csv";
  status?: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  agentId?: string;
  workflowId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
