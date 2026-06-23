import type { HttpClient } from "../http-client";
import type { PageResponse } from "../types/common";
import type {
  CreateTicketBody,
  CreateTicketCommentBody,
  CrossOrgTicketsResult,
  ListTicketsAcrossOrganizationsParams,
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

  /**
   * List tickets across EVERY organization the caller belongs to, annotated with
   * the org each ticket came from. Personal (cross-org) tokens only — org-scoped
   * keys get a 403. Useful for spotting duplicate reports across orgs. See NEX-2470.
   */
  async listAcrossOrganizations(
    params?: ListTicketsAcrossOrganizationsParams
  ): Promise<CrossOrgTicketsResult> {
    // The endpoint puts pagination (total/page/hasMore) in the envelope meta
    // (like tickets.list), so read it via requestWithMeta and fold it into the result.
    const { data, meta } = await this.http.requestWithMeta<
      Omit<CrossOrgTicketsResult, "total" | "page" | "hasMore">
    >("GET", "/tickets/across-organizations", {
      query: params as Record<string, string | number | undefined>
    });
    return {
      ...data,
      total: meta?.total ?? data.tickets.length,
      page: meta?.page ?? 1,
      hasMore: meta?.hasMore ?? false
    };
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
