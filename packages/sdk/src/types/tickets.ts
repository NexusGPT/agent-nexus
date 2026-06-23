// ============================================================================
// Ticket types
// ============================================================================

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

export interface TicketSummary {
  id: string;
  identifier: string;
  title: string;
  type: TicketType | null;
  priority: TicketPriority;
  status: string;
  url: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface TicketDetail extends TicketSummary {
  description: string | null;
  context: TicketContext | null;
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

/** Result of `client.tickets.listAcrossOrganizations()`. */
export interface CrossOrgTicketsResult {
  tickets: CrossOrgTicketSummary[];
  /** Total tickets gathered across orgs (bounded — duplicate-scan aid, not exhaustive). */
  total: number;
  /** Current page (1-based) of the merged result. */
  page: number;
  /** Whether more pages exist after the current one. */
  hasMore: boolean;
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
