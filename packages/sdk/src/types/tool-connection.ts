// ============================================================================
// Connect tool bodies
// ============================================================================

/** Body for connecting a tool via OAuth. */
export interface ConnectToolOAuthBody {
  authType: "oauth";
  service: string;
}

/** Body for connecting a tool via HTTP API key. */
export interface ConnectToolHttpBody {
  authType: "http";
  apiKey: string;
  name?: string;
}

/** Union body for connecting a tool (OAuth or HTTP). */
export type ConnectToolBody = ConnectToolOAuthBody | ConnectToolHttpBody;

// ============================================================================
// Connect tool responses
// ============================================================================

/** Response when initiating an OAuth connection flow. */
export interface ConnectToolOAuthResponse {
  authorizationUrl: string;
  handshakeId: string;
  expiresAt: string;
}

/** Response when creating an HTTP credential directly. */
export interface ConnectToolHttpResponse {
  id: string;
  name: string | null;
  type: string;
  status: string;
  createdAt: string;
}

// ============================================================================
// Handshake status
// ============================================================================

/** Status of an OAuth handshake polling request. */
export interface HandshakeStatusResponse {
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  connectionId: string | null;
  errorMessage: string | null;
  expiresAt: string | null;
}

// ============================================================================
// Create Pipedream credential
// ============================================================================

/** Body for creating a Pipedream credential after OAuth via connect link. */
export interface CreatePipedreamCredentialBody {
  accountId: string;
  name?: string;
}

/** Response when a Pipedream credential is created. */
export interface CreatePipedreamCredentialResponse {
  id: string;
  name: string | null;
  type: string;
  status: string;
  createdAt: string;
}
