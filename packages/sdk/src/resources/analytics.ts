import { BaseResource } from "./base-resource";

/** Result of an ad-hoc analytics query. `error` is set for query-level failures. */
export interface AnalyticsQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  fields: Array<{ name: string }>;
  executionTimeMs: number;
  truncated: boolean;
  error?: string;
}

/** A single filter in a structured analytics query. */
export interface AnalyticsStructuredFilter {
  field: string;
  op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte";
  value: string | number | boolean | Array<string | number>;
}

/** Body for a structured (non-SQL) analytics query. */
export interface AnalyticsStructuredQuery {
  /** Curated view: generations | traces | conversations | messages | executions | node_runs | scores. */
  view: string;
  /** Each metric is `count` or `<agg>:<column>` (agg = sum|avg|min|max). */
  metrics: string[];
  groupBy?: string[];
  filters?: AnalyticsStructuredFilter[];
  granularity?: "hour" | "day" | "week" | "month";
  period?: string;
  limit?: number;
  orderBy?: string;
  order?: "asc" | "desc";
}

/** Result of a structured query — the rows plus the SQL it compiled to. */
export interface AnalyticsStructuredQueryResult extends AnalyticsQueryResult {
  generatedSql: string;
}

export class AnalyticsResource extends BaseResource {
  async getOverview(params?: { timePeriod?: string; deploymentId?: string }): Promise<any> {
    return this.http.request<any>("GET", "/analytics/overview", {
      query: params as Record<string, string | undefined>
    });
  }

  async exportCsv(params?: { timePeriod?: string; deploymentId?: string }): Promise<string> {
    return this.http.requestRaw("GET", "/analytics/export", {
      query: params as Record<string, string | undefined>
    });
  }

  async listFeedback(params?: {
    timePeriod?: string;
    deploymentId?: string;
    score?: number;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const { data, meta } = await this.http.requestWithMeta<any[]>("GET", "/analytics/feedback", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta };
  }

  /** Run a single read-only SQL query over the curated, org-scoped analytics views. */
  async query(params: { query: string }): Promise<AnalyticsQueryResult> {
    return this.http.request<AnalyticsQueryResult>("POST", "/analytics/query", { body: params });
  }

  /**
   * Run a structured (non-SQL) query over the curated views — pick a view,
   * metrics, groupBy, filters, period and granularity. Returns the rows plus the
   * `generatedSql` the request compiled to.
   */
  async queryStructured(body: AnalyticsStructuredQuery): Promise<AnalyticsStructuredQueryResult> {
    return this.http.request<AnalyticsStructuredQueryResult>(
      "POST",
      "/analytics/query/structured",
      {
        body
      }
    );
  }
}
