// ============================================================================
// Credential types
// ============================================================================

export type CredentialSource = "oauth_connection" | "api_key_connection" | "tool_credential";
export type CredentialStatus = "CONNECTED" | "EXPIRING_SOON" | "NEEDS_REAUTH" | "DISCONNECTED";
export type CredentialSortField = "name" | "service" | "status" | "createdAt";

// ============================================================================
// Response types
// ============================================================================

export interface CredentialLinkedDeployment {
  id: string;
  name: string;
  type: string;
}

export interface CredentialCreator {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface Credential {
  id: string;
  source: CredentialSource;
  service: string;
  name: string | null;
  description: string | null;
  accountIdentifier: string | null;
  status: CredentialStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastUsedAt: string | null;
  linkedDeployments: CredentialLinkedDeployment[];
  createdBy: CredentialCreator | null;
  serviceImageUrl?: string | null;
}

// ============================================================================
// Request bodies
// ============================================================================

export interface UpdateCredentialBody {
  name?: string;
  description?: string | null;
}

// ============================================================================
// Query params
// ============================================================================

export interface ListCredentialsParams {
  page?: number;
  limit?: number;
  source?: CredentialSource;
  service?: string;
  status?: CredentialStatus;
  search?: string;
  sortBy?: CredentialSortField;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Delete response
// ============================================================================

export interface DeleteCredentialResponse {
  deleted: true;
}
