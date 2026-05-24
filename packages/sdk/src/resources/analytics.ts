import { BaseResource } from "./base-resource";

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
}
