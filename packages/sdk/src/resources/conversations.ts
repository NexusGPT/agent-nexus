import type { HttpClient } from "../http-client";
import type { PageResponse } from "../types/common";
import type {
  AddConversationCommentBody,
  ConversationComment,
  ConversationDetail,
  ConversationSummary,
  GetConversationParams,
  GetMessagesParams,
  GetMessagesResult,
  ListConversationsParams,
  SearchConversationsParams,
  SendAgentMessageBody,
  SendWhatsappTemplateBody,
  SetAssignedUsersBody,
  UpdateConversationMetadataBody,
  UpdateConversationStatusesBody,
  UpdateConversationTopicBody
} from "../types/conversations";
import { BaseResource } from "./base-resource";

export class ConversationsResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  async list(params?: ListConversationsParams): Promise<PageResponse<ConversationSummary>> {
    return this.http.requestPage<ConversationSummary>("GET", "/conversations", {
      query: params as Record<string, string | number | boolean | string[] | number[] | undefined>
    });
  }

  async get(conversationId: string, params?: GetConversationParams): Promise<ConversationDetail> {
    return this.http.request<ConversationDetail>("GET", `/conversations/${conversationId}`, {
      query: params as Record<string, string | undefined> | undefined
    });
  }

  async search(params: SearchConversationsParams): Promise<ConversationSummary[]> {
    return this.http.request<ConversationSummary[]>("GET", "/conversations/search", {
      query: params as unknown as Record<string, string>
    });
  }

  /**
   * Page with `nextBefore`, not with the oldest message you received: under
   * `visibleOnly` the page is filtered after it is read, so it can come back
   * short or empty while older messages remain — and an agent loop writes
   * several rows per millisecond, which only the server's composite cursor can
   * step through without dropping any. Pass it back verbatim; it is opaque.
   */
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<GetMessagesResult> {
    return this.http.request<GetMessagesResult>(
      "GET",
      `/conversations/${conversationId}/messages`,
      { query: params as Record<string, string | number | boolean | undefined> }
    );
  }

  async getComments(conversationId: string): Promise<{ comments: ConversationComment[] }> {
    return this.http.request<{ comments: ConversationComment[] }>(
      "GET",
      `/conversations/${conversationId}/comments`
    );
  }

  async getAssignedUsers(
    conversationId: string
  ): Promise<{ userIds: string[]; responseHandling: string }> {
    return this.http.request<{ userIds: string[]; responseHandling: string }>(
      "GET",
      `/conversations/${conversationId}/assigned-users`
    );
  }

  async updateStatuses(
    conversationId: string,
    body: UpdateConversationStatusesBody
  ): Promise<ConversationDetail> {
    return this.http.request<ConversationDetail>(
      "PATCH",
      `/conversations/${conversationId}/statuses`,
      { body }
    );
  }

  async setAssignedUsers(
    conversationId: string,
    body: SetAssignedUsersBody
  ): Promise<ConversationDetail> {
    return this.http.request<ConversationDetail>(
      "PUT",
      `/conversations/${conversationId}/assigned-users`,
      { body }
    );
  }

  async updateTopic(
    conversationId: string,
    body: UpdateConversationTopicBody
  ): Promise<ConversationDetail> {
    return this.http.request<ConversationDetail>(
      "PATCH",
      `/conversations/${conversationId}/topic`,
      { body }
    );
  }

  async getMetadata(conversationId: string): Promise<{ metadata: Record<string, unknown> }> {
    return this.http.request<{ metadata: Record<string, unknown> }>(
      "GET",
      `/conversations/${conversationId}/metadata`
    );
  }

  async updateMetadata(
    conversationId: string,
    body: UpdateConversationMetadataBody
  ): Promise<ConversationDetail> {
    return this.http.request<ConversationDetail>(
      "PATCH",
      `/conversations/${conversationId}/metadata`,
      { body }
    );
  }

  async addComment(
    conversationId: string,
    body: AddConversationCommentBody
  ): Promise<ConversationComment> {
    return this.http.request<ConversationComment>(
      "POST",
      `/conversations/${conversationId}/comments`,
      { body }
    );
  }

  async sendAgentMessage(
    conversationId: string,
    body: SendAgentMessageBody
  ): Promise<{ success: boolean }> {
    return this.http.request<{ success: boolean }>(
      "POST",
      `/conversations/${conversationId}/agent-message`,
      { body }
    );
  }

  async sendWhatsappTemplate(
    conversationId: string,
    body: SendWhatsappTemplateBody
  ): Promise<{ success: boolean; messageId: string; status?: string }> {
    return this.http.request<{ success: boolean; messageId: string; status?: string }>(
      "POST",
      `/conversations/${conversationId}/whatsapp-template`,
      { body }
    );
  }

  async markAsRead(conversationId: string): Promise<{ success: boolean }> {
    return this.http.request<{ success: boolean }>(
      "POST",
      `/conversations/${conversationId}/mark-as-read`
    );
  }

  async close(conversationId: string): Promise<{ id: string; deleted: boolean }> {
    return this.http.request<{ id: string; deleted: boolean }>(
      "DELETE",
      `/conversations/${conversationId}`
    );
  }
}
