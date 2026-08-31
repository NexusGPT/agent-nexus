// ============================================================================
// Ticket types
// ============================================================================

import type { PageResponse, PaginationMeta } from "./common";

export type TicketType = "BUG" | "FEATURE_REQUEST" | "IMPROVEMENT";
export type TicketPriority = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export interface TicketContext {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  errorCode?: string;
  requestBody?: string;
  responseBody?: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: string;
  sdkVersion?: string;
  agentId?: string;
}

// ============================================================================
// Response types
// ============================================================================

/**
 * Pagination for the ticket list.
 *
 * This is the shared {@link PaginationMeta}, and the alias is kept because the
 * ticket route is where its optionality bites hardest and this name is where a
 * reader goes looking for the reason.
 *
 * 🔴 `total` IS OPTIONAL AND THAT IS THE CONTRACT, NOT AN OVERSIGHT. The upstream
 * provider fetch is bounded, so past that bound the server can only offer a floor
 * — and it publishes nothing rather than a floor wearing a total's name. Present
 * means exact; absent means unknown.
 *
 * `total` and `totalPages` travel together, because the second is derived from
 * the first and inherits its uncertainty exactly.
 *
 * `paging` reports REACHABILITY, not existence: `"exhausted"` means nothing
 * more can be paged to, even where the provider holds rows past the bound. That
 * second fact is what the absent `total` carries. Page on `paging`; it
 * terminates, and it says `"did-not-say"` rather than guessing.
 */
export type TicketListMeta = PaginationMeta;

/** A page of tickets, with metadata whose total may legitimately be missing. */
export type TicketListPage = PageResponse<TicketSummary>;

export interface TicketSummary {
  id: string;
  identifier: string;
  title: string;
  type: TicketType | null;
  priority: TicketPriority;
  status: string;
  url: string;
  /**
   * Linear labels on the ticket, excluding the reserved type label — that one is
   * surfaced as `type`. Safe to feed straight back into a create/update `labels`.
   */
  labels: string[];
  createdAt: string;
  updatedAt: string | null;
}

export interface TicketDetail extends TicketSummary {
  description: string | null;
  context: TicketContext | null;
  /**
   * When the ticket was archived, or `null` while it is live.
   *
   * An archived ticket is READ-ONLY: `update`, `addComment` and
   * `uploadAttachment` answer 409 on it. Read this before offering any of the
   * three, because the ticket is otherwise indistinguishable from a live one.
   *
   * Detail only, and that is a fact about the data rather than an omission:
   * archiving a ticket hides it from `list`, so a summary field would be
   * permanently null.
   */
  archivedAt: string | null;
}

export interface TicketComment {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

// ============================================================================
// Request bodies
// ============================================================================

export interface CreateTicketBody {
  title: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  context?: TicketContext;
  /**
   * Extra Linear labels to attach, e.g. `["CUE"]` to mark an agent-filed ticket.
   * Created on demand when the team does not have them yet. The reserved type
   * labels ("bug", "feature-request", "improvement") are rejected — use `type`.
   */
  labels?: string[];
}

export interface UpdateTicketBody {
  title?: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  /**
   * Workflow-state name to transition the ticket to, e.g. "Canceled", "Done",
   * "In Progress". Accepts the same state names as `tickets.list({ status })`.
   */
  status?: string;
  /**
   * Replaces the ticket's non-type labels wholesale. Omit to leave them alone;
   * pass `[]` to clear them. The type label is preserved regardless.
   */
  labels?: string[];
}

export interface CreateTicketCommentBody {
  body: string;
}

// ============================================================================
// Query params
// ============================================================================

export interface ListTicketsParams {
  page?: number;
  limit?: number;
  type?: TicketType;
  priority?: TicketPriority;
  status?: string;
  search?: string;
}

/** A ticket annotated with the organization it belongs to (cross-org listing). */
export interface CrossOrgTicketSummary extends TicketSummary {
  organizationId: string;
  organizationName: string | null;
}

/** Filters for `client.tickets.listAcrossOrganizations()`. `page`/`limit` page the merged result. */
export interface ListTicketsAcrossOrganizationsParams {
  page?: number;
  limit?: number;
  type?: TicketType;
  priority?: TicketPriority;
  status?: string;
  search?: string;
}

/**
 * Result of `client.tickets.listAcrossOrganizations()`.
 *
 * The pagination fields carry what the SERVER published, in the same
 * {@link PaginationMeta} shape every other list uses — absent where it said
 * nothing. This route aggregates across organizations and skips the ones whose
 * fetch failed, so a count derived from the merged rows would be a floor on a
 * floor.
 */
export interface CrossOrgTicketsResult {
  tickets: CrossOrgTicketSummary[];
  /** Pagination as published by the server; see {@link PaginationMeta}. */
  meta: PaginationMeta;
  /** How many organizations the caller belongs to. */
  organizationCount: number;
  /** Orgs whose ticket fetch failed and were skipped (best-effort aggregation). */
  skippedOrganizationIds: string[];
}

// ============================================================================
// Attachment types
// ============================================================================

export interface TicketAttachment {
  id: string;
  filename: string;
  url: string;
  contentType: string | null;
  size: number | null;
  createdAt: string;
}
