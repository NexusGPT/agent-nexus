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
  /**
   * The external tool this credential is scoped to, or null for the
   * organization-wide sources (`oauth_connection`, `api_key_connection`).
   *
   * `service` is a display label and two tools can share one, so it cannot
   * answer "is THIS tool connected" — this can. It is the id
   * `tools.credentials(toolId)` takes.
   */
  toolId?: string | null;
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
  /** Only the credentials scoped to this external tool. */
  toolId?: string;
  sortBy?: CredentialSortField;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Delete response
// ============================================================================

export interface DeleteCredentialResponse {
  deleted: true;
}

// ============================================================================
// Connect an external app — standalone (no workflow, no agent, no node)
// ============================================================================

/**
 * OAuth arm of `POST /public/v1/credentials/connect`.
 *
 * `service` is the account to authorize — a built-in OAuth service name
 * (`GMAIL`, `GOOGLE_SHEETS`, `NOTION`, …) or a Pipedream app slug
 * (`google_sheets`). It is NOT a tool id, and no tool id is needed: the
 * tool-scoped route's OAuth branch never reads the one it demands.
 */
export interface ConnectCredentialOAuthBody {
  authType: "oauth";
  service: string;
}

/**
 * API-key arm of `POST /public/v1/credentials/connect`.
 *
 * `toolId` IS required here, unlike the OAuth arm: the key is stored against
 * that tool's auth block. Resolve it with `client.tools.search()`.
 *
 * The tool-scoped route spells this same branch `authType: "http"`, after the
 * `user_http` auth block it writes. Same mechanism, clearer word.
 */
export interface ConnectCredentialApiKeyBody {
  authType: "api_key";
  toolId: string;
  apiKey: string;
  name?: string;
}

export type ConnectCredentialBody = ConnectCredentialOAuthBody | ConnectCredentialApiKeyBody;

/** Nothing is connected yet — open `authorizationUrl`, then poll `connectStatus`. */
export interface ConnectCredentialOAuthResult {
  authType: "oauth";
  authorizationUrl: string;
  handshakeId: string;
  expiresAt: string;
}

/**
 * The credential exists as of this response.
 *
 * 🚨 TWO IDS. `credentialId` is the unified inventory id — the one
 * `credentials.get/update/delete` and `credentials.cards.listByCredential`
 * take. `toolCredentialId` is the tool-scoped id that `tools.credentials()`
 * lists and `toolConnection.deleteCredential()` takes. Both are UUIDs and
 * neither namespace accepts the other's.
 *
 * `credentialId` is `null` only for a tool-credential row that carries no
 * unified `Credential` row.
 */
export interface ConnectCredentialApiKeyResult {
  authType: "api_key";
  credentialId: string | null;
  toolCredentialId: string;
  name: string | null;
  type: string;
  status: string;
  createdAt: string;
}

export type ConnectCredentialResult = ConnectCredentialOAuthResult | ConnectCredentialApiKeyResult;
