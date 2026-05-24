import type { HttpClient } from "../http-client";
import type { PageResponse } from "../types/common";
import type {
  CreateTicketBody,
  CreateTicketCommentBody,
  ListTicketsParams,
  TicketAttachment,
  TicketComment,
  TicketDetail,
  TicketSummary,
  UpdateTicketBody
} from "../types/tickets";
import { BaseResource } from "./base-resource";

export class TicketsResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  async list(params?: ListTicketsParams): Promise<PageResponse<TicketSummary>> {
    const { data, meta } = await this.http.requestWithMeta<TicketSummary[]>("GET", "/tickets", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
  }

  async get(ticketId: string): Promise<TicketDetail> {
    return this.http.request<TicketDetail>("GET", `/tickets/${ticketId}`);
  }

  async create(body: CreateTicketBody): Promise<TicketDetail> {
    return this.http.request<TicketDetail>("POST", "/tickets", { body });
  }

  async update(ticketId: string, body: UpdateTicketBody): Promise<TicketDetail> {
    return this.http.request<TicketDetail>("PATCH", `/tickets/${ticketId}`, { body });
  }

  async addComment(ticketId: string, body: CreateTicketCommentBody): Promise<TicketComment> {
    return this.http.request<TicketComment>("POST", `/tickets/${ticketId}/comments`, { body });
  }

  async listComments(ticketId: string): Promise<{ comments: TicketComment[] }> {
    return this.http.request<{ comments: TicketComment[] }>("GET", `/tickets/${ticketId}/comments`);
  }

  async uploadAttachment(ticketId: string, file: Blob | File): Promise<TicketAttachment> {
    const formData = new FormData();
    formData.append("file", file);
    return this.http.request<TicketAttachment>("POST", `/tickets/${ticketId}/attachments`, {
      body: formData
    });
  }

  async listAttachments(ticketId: string): Promise<{ attachments: TicketAttachment[] }> {
    return this.http.request<{ attachments: TicketAttachment[] }>(
      "GET",
      `/tickets/${ticketId}/attachments`
    );
  }
}
