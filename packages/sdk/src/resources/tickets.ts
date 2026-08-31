import { type HttpClient, normalizePagingMeta } from "../http-client";
import { appendFilePart } from "../multipart";
import type {
  CreateTicketBody,
  CreateTicketCommentBody,
  CrossOrgTicketsResult,
  ListTicketsAcrossOrganizationsParams,
  ListTicketsParams,
  TicketAttachment,
  TicketComment,
  TicketDetail,
  TicketListPage,
  TicketSummary,
  UpdateTicketBody
} from "../types/tickets";
import { BaseResource } from "./base-resource";

export class TicketsResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  /**
   * List tickets.
   *
   * ⚠️ `meta.total` CAN BE ABSENT HERE, and on this route that is routine
   * rather than exceptional. The upstream fetch is bounded, so past that bound
   * the server cannot establish a count and publishes none — absent means
   * unknown, present means exact. Page on `meta.paging`; it terminates, and it
   * reports `"did-not-say"` rather than inventing a stop.
   */
  async list(params?: ListTicketsParams): Promise<TicketListPage> {
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
    // The endpoint puts pagination in the envelope meta (like tickets.list), so
    // read it via requestWithMeta and fold it into the result. The meta is
    // normalized, never synthesized: this route aggregates across orgs and skips
    // the ones that failed, so `data.tickets.length` is a floor on a floor and
    // naming it `total` would be the page size wearing a population's name.
    const { data, meta } = await this.http.requestWithMeta<Omit<CrossOrgTicketsResult, "meta">>(
      "GET",
      "/tickets/across-organizations",
      { query: params as Record<string, string | number | undefined> }
    );
    return { ...data, meta: normalizePagingMeta(meta) };
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
