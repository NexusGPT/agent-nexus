// ============================================================================
// API key connection types
// ============================================================================

export type ApiKeyService =
  | "TELEGRAM"
  | "TWILIO"
  | "SLACK_BOT"
  | "SLACK_WORKSPACE"
  | "TEAMS_BOT"
  | "OFFICE_ADDIN"
  | "FB_MESSENGER_PAGE"
  | "META_WHATSAPP"
  | "META_INSTAGRAM";

export interface ApiKeyConnection {
  id: string;
  service: ApiKeyService;
  name: string | null;
  description: string | null;
  status: string;
  apiKeyConnectionId: string | null;
  oauthConnectionId: string | null;
  createdAt: string;
  /** Absent on rows the server has never updated. */
  updatedAt?: string | null;
}

// ============================================================================
// Request bodies
// ============================================================================

export interface CreateApiKeyConnectionBody {
  /** Service this connection authenticates against (e.g. `SLACK_BOT`). */
  service: ApiKeyService;
  /**
   * Service-specific secret credentials. The required keys depend on the
   * service — e.g. SLACK_BOT expects `{ botToken, signingSecret? }`.
   */
  credentials: Record<string, string>;
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  /** Parent connection id, for child connections. */
  apiKeyConnectionId?: string;
}
