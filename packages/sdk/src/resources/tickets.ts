import type { HttpClient } from "../http-client";
import { appendFilePart } from "../multipart";
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
    return this.http.requestPage<TicketSummary>("GET", "/tickets", {
      query: params as Record<string, string | number | undefined>
    });
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

  /**
   * Attach a file to a ticket.
   *
   * @param ticketId - Ticket id or identifier.
   * @param file - The file, as a `Blob` or `File`.
   * @param fileName - File name to send. This one is STORED and shown in
   *   `listAttachments()`, so a bare `Blob` sent without it is filed as `blob`.
   *   A `File` supplies its own name.
   */
  async uploadAttachment(
    ticketId: string,
    file: Blob | File,
    fileName?: string
  ): Promise<TicketAttachment> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
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
