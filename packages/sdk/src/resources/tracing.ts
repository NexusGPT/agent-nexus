import type { DeleteResponse, PageResponse } from "../types/common";
import type {
  AnalyticsSummaryParams,
  BulkExportParams,
  CostBreakdown,
  CostBreakdownParams,
  ExportTraceParams,
  GenerationDetail,
  GenerationSummary,
  ListGenerationsParams,
  ListTracesParams,
  Timeline,
  TimelineParams,
  TraceDetail,
  TraceExport,
  TraceSummary,
  TracingSummary
} from "../types/tracing";
import { BaseResource } from "./base-resource";

export class TracingResource extends BaseResource {
  // ── Traces ──────────────────────────────────────────────────────────────

  async listTraces(params?: ListTracesParams): Promise<PageResponse<TraceSummary>> {
    const { data, meta } = await this.http.requestWithMeta<TraceSummary[]>(
      "GET",
      "/tracing/traces",
      { query: params as Record<string, string | number | undefined> }
    );
    return { data, meta: meta! };
  }

  async getTrace(traceId: string): Promise<TraceDetail> {
    return this.http.request<TraceDetail>("GET", `/tracing/traces/${traceId}`);
  }

  async deleteTrace(traceId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/tracing/traces/${traceId}`);
  }

  // ── Generations ─────────────────────────────────────────────────────────

  async listGenerations(params?: ListGenerationsParams): Promise<PageResponse<GenerationSummary>> {
    const { data, meta } = await this.http.requestWithMeta<GenerationSummary[]>(
      "GET",
      "/tracing/generations",
      { query: params as Record<string, string | number | undefined> }
    );
    return { data, meta: meta! };
  }

  async getGeneration(generationId: string): Promise<GenerationDetail> {
    return this.http.request<GenerationDetail>("GET", `/tracing/generations/${generationId}`);
  }

  // ── Models ──────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    return this.http.request<string[]>("GET", "/tracing/models");
  }

  // ── Analytics ───────────────────────────────────────────────────────────

  async getSummary(params?: AnalyticsSummaryParams): Promise<TracingSummary> {
    return this.http.request<TracingSummary>("GET", "/tracing/analytics/summary", {
      query: params as Record<string, string | number | undefined>
    });
  }

  async getCostBreakdown(params?: CostBreakdownParams): Promise<CostBreakdown> {
    // groupBy may be a single dimension or an array; the http layer serializes
    // arrays as repeated query params, which the API parses into a 1–3 dim list.
    return this.http.request<CostBreakdown>("GET", "/tracing/analytics/cost-breakdown", {
      query: params as Record<string, string | number | string[] | undefined>
    });
  }

  async getTimeline(params?: TimelineParams): Promise<Timeline> {
    return this.http.request<Timeline>("GET", "/tracing/analytics/timeline", {
      query: params as Record<string, string | number | undefined>
    });
  }

  // ── Export ──────────────────────────────────────────────────────────────

  async exportTrace(traceId: string, params?: ExportTraceParams): Promise<TraceExport> {
    return this.http.request<TraceExport>("POST", `/tracing/traces/${traceId}/export`, {
      body: params
    });
  }

  async bulkExport(params?: BulkExportParams): Promise<TraceExport> {
    return this.http.request<TraceExport>("POST", "/tracing/export", { body: params });
  }
}
