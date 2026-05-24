import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

export class EvaluationsResource extends BaseResource {
  async createSession(taskId: string, body: { name: string; description?: string }): Promise<any> {
    return this.http.request<any>("POST", `/skills/tasks/${taskId}/evaluations`, { body });
  }

  async listSessions(
    taskId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>(
      "GET",
      `/skills/tasks/${taskId}/evaluations`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
    return { data, meta: meta! };
  }

  async getSession(taskId: string, sessionId: string): Promise<any> {
    return this.http.request<any>("GET", `/skills/tasks/${taskId}/evaluations/${sessionId}`);
  }

  async deleteSession(taskId: string, sessionId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/skills/tasks/${taskId}/evaluations/${sessionId}`);
  }

  async getDatasetRows(
    taskId: string,
    sessionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>(
      "GET",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/dataset`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
    return { data, meta: meta! };
  }

  async addDatasetRow(
    taskId: string,
    sessionId: string,
    body: { input: unknown; expectedOutput?: unknown }
  ): Promise<any> {
    return this.http.request<any>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/dataset/rows`,
      { body }
    );
  }

  async execute(taskId: string, sessionId: string): Promise<any> {
    return this.http.request<any>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/execute`
    );
  }

  async judge(
    taskId: string,
    sessionId: string,
    body?: { judgeModel?: string; judgePrompt?: string }
  ): Promise<any> {
    return this.http.request<any>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/judge`,
      { body }
    );
  }

  async getResults(
    taskId: string,
    sessionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>(
      "GET",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/results`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
    return { data, meta: meta! };
  }

  async listFormats(): Promise<any[]> {
    return this.http.request<any[]>("GET", "/skills/evaluations/formats");
  }

  async listJudges(): Promise<any[]> {
    return this.http.request<any[]>("GET", "/skills/evaluations/judges");
  }
}
