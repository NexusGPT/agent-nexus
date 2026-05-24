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
