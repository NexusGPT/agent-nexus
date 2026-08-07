import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

export interface PromptAssistantChatBody {
  message: string;
  threadId?: string;
  mode: "agent" | "ai-task";
}

export interface ListPromptAssistantThreadsParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20, max 100). */
  limit?: number;
}

export interface PromptAssistantThreadSummary {
  threadId: string;
  mode: string | null;
  status: "in_progress" | "generating" | "completed" | "failed" | "cancelled";
  /** First user message (truncated) or the generated name once completed. */
  summary: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface PromptAssistantChatResponse {
  threadId: string;
  response: string;
  status: "in_progress" | "generating" | "completed" | "failed";
}

export interface PromptAssistantThreadMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface PromptResult {
  prompt: string;
  name: string;
  description: string;
  input?: { type: "json" | "text"; schema?: Record<string, unknown> };
  output?: { type: "json" | "text"; schema?: Record<string, unknown> };
  agentFields?: Record<string, unknown>;
}

export interface PromptAssistantThreadResponse {
  threadId: string;
  status: "in_progress" | "generating" | "completed" | "failed";
  messages: PromptAssistantThreadMessage[];
  promptResult?: PromptResult;
}

export class PromptAssistantResource extends BaseResource {
  async chat(body: PromptAssistantChatBody): Promise<PromptAssistantChatResponse> {
    return this.http.request<PromptAssistantChatResponse>("POST", "/prompt-assistant/chat", {
      body
    });
  }

  /**
   * List threads (newest first) for discovery / recovery of a thread whose
   * ID was lost (e.g. the creating chat call was killed before its response
   * was parsed). NEX-2084.
   */
  async listThreads(
    params?: ListPromptAssistantThreadsParams
  ): Promise<PageResponse<PromptAssistantThreadSummary>> {
    return this.http.requestPage<PromptAssistantThreadSummary>("GET", "/prompt-assistant/threads", {
      query: params as Record<string, string | number | undefined>
    });
  }

  async getThread(threadId: string): Promise<PromptAssistantThreadResponse> {
    return this.http.request<PromptAssistantThreadResponse>(
      "GET",
      `/prompt-assistant/threads/${threadId}`
    );
  }

  async deleteThread(threadId: string): Promise<{ deleted: boolean }> {
    return this.http.request<{ deleted: boolean }>(
      "DELETE",
      `/prompt-assistant/threads/${threadId}`
    );
  }
}
