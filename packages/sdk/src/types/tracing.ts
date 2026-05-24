// ── Trace ──

export interface TraceSummary {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  agentId: string | null;
  agentName: string | null;
  workflowId: string | null;
  workflowName: string | null;
  conversationId: string | null;
  totalCostUsd: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalDurationMs: number | null;
  generationCount: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TraceDetail extends TraceSummary {
  executionId: string | null;
  generations: GenerationSummary[];
}

// ── Generation ──

export interface GenerationSummary {
  id: string;
  traceId: string;
  provider: string;
  modelName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  taskId: string | null;
  taskName: string | null;
  nodeId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface GenerationDetail extends GenerationSummary {
  systemPrompt: string | null;
  messages: Record<string, unknown>[] | null;
  tools: Record<string, unknown>[] | null;
  temperature: number | null;
  response: string | null;
  responseJson: Record<string, unknown> | null;
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
  previousPeriod: {
    totalTraces: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } | null;
}

export interface CostBreakdownEntry {
  groupKey: string;
  groupLabel: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  traceCount: number;
  generationCount: number;
}

export interface CostBreakdown {
  entries: CostBreakdownEntry[];
}

export interface TimelinePoint {
  date: string;
  traceCount: number;
  generationCount: number;
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
  provider?: string;
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
  groupBy?: "model" | "agent" | "workflow";
}

export interface TimelineParams {
  startDate?: string;
  endDate?: string;
  granularity?: "hour" | "day" | "week";
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
