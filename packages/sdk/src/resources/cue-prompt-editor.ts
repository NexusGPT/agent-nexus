import { BaseResource } from "./base-resource";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface CuePromptEditorChatBody {
  agentId: string;
  message: string;
  conversationId?: string;
  quote?: string;
  suggestionOutcomes?: Array<{ suggestionId: string; status: "accepted" | "rejected" }>;
}

export interface CueUpdateSuggestionStatusBody {
  status: "accepted" | "rejected";
  conversationId: string;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface CueSuggestion {
  suggestionId: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
  explanation: string;
}

export interface CuePlanStep {
  id: string;
  name: string;
  action: string;
  status: "pending" | "completed";
  before?: string;
  after?: string;
  reasoning?: string;
}

export interface CuePlan {
  id: string;
  name: string;
  goal: string;
  progress: string;
  steps: CuePlanStep[];
}

export interface CuePromptEditorChatResponse {
  conversationId: string;
  response: string;
  status: "completed" | "max_iterations";
  suggestions: CueSuggestion[];
  plan?: CuePlan;
}

export interface CueConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CueConversationDetail {
  id: string;
  agentId: string;
  title: string | null;
  messages: Array<{
    id: string;
    type: "user" | "assistant" | "suggestion";
    content: string | null;
    quote?: string | null;
    suggestion?: CueSuggestion;
    suggestionStatus?: "accepted" | "rejected" | "pending" | "failed";
    createdAt: string;
  }>;
  plan?: CuePlan;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

export class CuePromptEditorResource extends BaseResource {
  async chat(body: CuePromptEditorChatBody): Promise<CuePromptEditorChatResponse> {
    return this.http.request<CuePromptEditorChatResponse>("POST", "/cue/prompt-editor/chat", {
      body
    });
  }

  async listConversations(
    agentId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ conversations: CueConversationSummary[]; total: number }> {
    return this.http.request<{ conversations: CueConversationSummary[]; total: number }>(
      "GET",
      "/cue/prompt-editor/conversations",
      { query: { agentId, ...params } }
    );
  }

  async getConversation(conversationId: string): Promise<CueConversationDetail> {
    return this.http.request<CueConversationDetail>(
      "GET",
      `/cue/prompt-editor/conversations/${conversationId}`
    );
  }

  async deleteConversation(conversationId: string): Promise<{ deleted: boolean }> {
    return this.http.request<{ deleted: boolean }>(
      "DELETE",
      `/cue/prompt-editor/conversations/${conversationId}`
    );
  }

  async updateSuggestionStatus(
    suggestionId: string,
    body: CueUpdateSuggestionStatusBody
  ): Promise<{ updated: boolean }> {
    return this.http.request<{ updated: boolean }>(
      "PATCH",
      `/cue/prompt-editor/suggestions/${suggestionId}/status`,
      { body }
    );
  }
}
