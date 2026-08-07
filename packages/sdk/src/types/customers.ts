import type { PageResponse } from "./common";

export interface CustomerSummary {
  id: string;
  organizationId: string;
  externalUserId: string | null;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  avatarUrl: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  totalSessions: number;
  totalMessages: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface CustomerIdentity {
  id: string;
  identifier: string;
  service: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface CustomerSession {
  id: string;
  deploymentId: string;
  deploymentName: string | null;
  deploymentType: string | null;
  createdAt: string;
  messageCount: number;
  chatNanoId: string | null;
}

export interface CustomerDetail extends CustomerSummary {
  identities: CustomerIdentity[];
  recentSessions: CustomerSession[];
}

export interface ListCustomersParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateCustomerBody {
  displayName: string;
  externalUserId?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface UpdateCustomerBody {
  displayName?: string;
  externalUserId?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  avatarUrl?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface AddCustomerNoteBody {
  content: string;
}

export type ListCustomersResponse = PageResponse<CustomerSummary>;

/**
 * Response from `client.customers.addNote()`.
 *
 * `userName` is always `null` on this route — the public API knows the API key's
 * user id but not its display name.
 */
export interface CustomerNote {
  /** Note UUID. */
  id: string;
  /** Note body. */
  content: string;
  /** Id of the API-key user who wrote it, or the literal `"api"` when unidentified. */
  userId: string;
  /** Always `null` on this route. */
  userName: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}
