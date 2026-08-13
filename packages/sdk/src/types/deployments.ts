// ============================================================================
// Deployment type
// ============================================================================

/**
 * Channel a deployment publishes an agent to.
 *
 * These are the 22 values the Public API v1 accepts and emits. A deployment row
 * whose `type` column is null is mapped to the literal `"WIDGET"`, which is NOT
 * one of these — the column is non-null in the schema, so that fallback is
 * unreachable rather than a case to model here.
 */
export type DeploymentType =
  | "EMBED"
  | "WHATSAPP"
  | "TELEGRAM"
  | "OUTLOOK"
  | "SLACK"
  | "TEAMS"
  | "SMS"
  | "TWILIO_SMS"
  | "TWILIO_VOICE"
  | "GMAIL"
  | "FB_MESSENGER"
  | "GOOGLE_SHEETS"
  | "EXCEL_ADDIN"
  | "OUTLOOK_ADDIN"
  | "POWERPOINT_ADDIN"
  | "WORD_ADDIN"
  | "AIRTABLE"
  | "GOOGLE_MEET"
  | "ZOOM"
  | "API"
  | "IMAP"
  | "SMTP";

// ============================================================================
// Deployment (response shapes)
// ============================================================================

/** One row of `client.deployments.list()`. */
export interface DeploymentSummary {
  /** Deployment UUID. */
  id: string;
  /** Deployment display name. Empty string when the row carries none. */
  name: string;
  /** Free-text description, or `null`. */
  description: string | null;
  /** Channel this deployment publishes to. */
  type: DeploymentType;
  /** UUID of the agent behind this deployment, or `null` when unassigned. */
  agentId: string | null;
  /** Agent display name, or `null` when unassigned or unnamed. */
  agentName: string | null;
  /** Whether the deployment is serving traffic. */
  isActive: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

/** Response from `client.deployments.get()`, `create()` and `update()`. */
export interface DeploymentDetail extends DeploymentSummary {
  /** Channel-specific settings. Shape depends on {@link DeploymentType}. */
  settings: unknown;
  /**
   * State of the underlying provider connection, or `null` when the channel
   * needs none. Derived from the OAuth connection's status, falling back to the
   * API-key connection's.
   */
  connectionStatus: string | null;
}

/**
 * Response from `client.deployments.delete()`.
 *
 * Deliberately NOT the shared `DeleteResponse`: this endpoint returns the id
 * alone and emits no `deleted` field.
 */
export interface DeleteDeploymentResponse {
  /** UUID of the deleted deployment. */
  id: string;
}

// ============================================================================
// Statistics
// ============================================================================

/** One conversation session counted by `client.deployments.getStatistics()`. */
export interface DeploymentStatsSession {
  /** Session UUID. */
  id: string;
  /** UUID of the first chat on this session, or `null` when it has none. */
  chatId: string | null;
  /** Messages exchanged on this session. */
  messageCount: number;
  /** ISO 8601 last-activity timestamp. */
  updatedAt: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Response from `client.deployments.getStatistics()`.
 *
 * The server reads at most 500 sessions, so `totalSessions` is the length of
 * `sessions` rather than a true count for a busy deployment.
 */
export interface DeploymentStats {
  /** Number of sessions in `sessions`. */
  totalSessions: number;
  /** Messages summed across `sessions`. */
  totalMessages: number;
  /** The sessions themselves, newest first. */
  sessions: DeploymentStatsSession[];
}

// ============================================================================
// Embed config
// ============================================================================

/** Localized string overrides, keyed by locale code (`"en"`, `"fr"`, ...). */
export type EmbedLocalizedText = Record<string, string>;

/** Localized string-array overrides, keyed by locale code. */
export type EmbedLocalizedTextList = Record<string, string[]>;

/** A link rendered in the widget footer or on the landing screen. */
export interface EmbedFooterLink {
  /** Stable id — the key a localized override is written against. */
  id: string;
  label: string;
  url: string;
}

/** Per-locale override of a footer link. Omitted fields fall back to the shared entry. */
export interface EmbedFooterLinkOverride {
  label?: string;
  url?: string;
}

/** Legacy preset icon names accepted for a landing-screen action button. */
export type EmbedPresetIconName =
  | "whatsapp"
  | "email"
  | "phone"
  | "link"
  | "messenger"
  | "telegram"
  | "instagram"
  | "x"
  | "facebook"
  | "linkedin"
  | "custom";

/** Icon of a landing-screen action button. */
export type EmbedActionButtonIcon =
  | { type: "favicon" }
  | { type: "emoji"; emoji: string }
  | { type: "image"; url: string }
  | { type: "preset"; name: EmbedPresetIconName };

/** A channel button on the widget landing screen (WhatsApp link, email, phone, ...). */
export interface EmbedActionButton {
  /** Stable id — the key a localized override is written against. */
  id: string;
  label: string;
  description: string;
  /** A bare preset name is the legacy spelling and is still accepted. */
  icon: EmbedActionButtonIcon | EmbedPresetIconName;
  url: string;
}

/** Per-locale override of an action button. The icon stays shared across locales. */
export interface EmbedActionButtonOverride {
  label?: string;
  description?: string;
  url?: string;
}

/**
 * Response from `client.deployments.getEmbedConfig()` and
 * `updateEmbedConfig()`.
 *
 * This is the widget's own appearance object — the same settings the dashboard
 * editor writes and the rendered widget reads. `updateEmbedConfig` returns the
 * whole merged config, not just the patch.
 *
 * A required field is always present; an optional one is absent when the owner
 * never set it. Nothing here is ever `null`: a field the stored settings omit
 * comes back as its product default, so a colour or a label is always a usable
 * value.
 *
 * The server-side HMAC secret behind `identityVerificationEnabled` is
 * deliberately not part of this object and cannot be read or written through
 * the API — publishing it would let its holder forge a visitor identity.
 * Manage it in the dashboard.
 */
export interface EmbedConfig {
  // -- Display ---------------------------------------------------------------
  /** Agent name shown in the widget. */
  displayName: string;
  localizedDisplayName?: EmbedLocalizedText;
  /** Messages the widget opens with. */
  welcomeMessages: string[];
  localizedWelcomeMessages?: EmbedLocalizedTextList;
  /** Locale used when the visitor's own language is not configured. */
  defaultLanguage?: string;
  /** Locales the owner configured. Derived from the `localized*` keys when absent. */
  supportedLanguages?: string[];
  /** Prompt chips offered to the visitor. */
  suggestedMessages: string[];
  localizedSuggestedMessages?: EmbedLocalizedTextList;
  /** Launcher style. */
  format: "bubble" | "classic";
  showTimestamp?: boolean;

  // -- Opening popup ---------------------------------------------------------
  autoShowInitialMessagePopup: boolean;
  /** Delay in seconds before the popup appears. */
  autoShowInitialMessagePopupDelay: number;

  // -- Bubble ----------------------------------------------------------------
  bubblePosition: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  bubbleBorderRadius: "none" | "sm" | "md" | "lg" | "full";
  bubbleBackgroundColor: string;
  bubbleBorderColor: string;
  bubbleBorderWidth: number;
  bubbleSize: "small" | "medium" | "large";

  // -- Theming ---------------------------------------------------------------
  uiAppearance: "system" | "light" | "dark";
  uiRadius: "sm" | "md" | "lg";
  uiContainerRadius: "sm" | "md" | "lg" | "none";
  uiBgPattern: string;
  uiPrimaryColor: string;
  uiAgentMessageColor: string;
  uiAgentMessageTextColor: string;
  uiUserMessageColor: string;
  uiUserMessageTextColor: string;

  // -- Header ----------------------------------------------------------------
  showHeader: boolean;
  headerMessage: string;
  localizedHeaderMessage?: EmbedLocalizedText;

  // -- Footer ----------------------------------------------------------------
  showFooter: boolean;
  footerMessage: string;
  localizedFooterMessage?: EmbedLocalizedText;
  footerLinks: EmbedFooterLink[];
  /** Locale code, then footer-link id. */
  localizedFooterLinks?: Record<string, Record<string, EmbedFooterLinkOverride>>;

  // -- Chat input ------------------------------------------------------------
  chatInputPlaceholder: string;
  localizedChatInputPlaceholder?: EmbedLocalizedText;

  // -- Landing screen (bubble format only) -----------------------------------
  landingScreenEnabled: boolean;
  landingScreenWelcomeMessage: string;
  localizedLandingScreenWelcomeMessage?: EmbedLocalizedText;
  landingScreenNewConversationLabel: string;
  localizedLandingScreenNewConversationLabel?: EmbedLocalizedText;
  landingScreenNewConversationDescription: string;
  localizedLandingScreenNewConversationDescription?: EmbedLocalizedText;
  landingScreenShowPastConversations: boolean;
  /** Allow a new conversation only when no past one is still active. */
  landingScreenSingleActiveConversation?: boolean;
  /** Hours of inactivity after which an open conversation stops blocking a new one. Defaults to 3. */
  landingScreenInactiveConversationThresholdHours?: number;
  landingScreenHidePastConversationsEnabled?: boolean;
  /** Days of inactivity after which a past conversation is hidden. Defaults to 30. */
  landingScreenHidePastConversationsAfterDays?: number;
  landingScreenPastConversationsTitle: string;
  localizedLandingScreenPastConversationsTitle?: EmbedLocalizedText;
  landingScreenChannelsTitle: string;
  localizedLandingScreenChannelsTitle?: EmbedLocalizedText;
  landingScreenActionButtons: EmbedActionButton[];
  /** Locale code, then action-button id. */
  localizedLandingScreenActionButtons?: Record<string, Record<string, EmbedActionButtonOverride>>;
  landingScreenShowFooter?: boolean;
  landingScreenFooterMessage?: string;
  localizedLandingScreenFooterMessage?: EmbedLocalizedText;
  landingScreenFooterLinks?: EmbedFooterLink[];
  /** Locale code, then footer-link id. */
  localizedLandingScreenFooterLinks?: Record<string, Record<string, EmbedFooterLinkOverride>>;

  // -- Identity verification -------------------------------------------------
  /** Whether an `externalUserId` must arrive with a valid HMAC-SHA256 hash. */
  identityVerificationEnabled?: boolean;
}

// ============================================================================
// Request bodies and params
// ============================================================================

/** Query parameters accepted by `client.deployments.list()`. */
export interface ListDeploymentsParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Free-text filter on the deployment name. */
  search?: string;
  /** Restrict to one channel. */
  type?: DeploymentType;
  /** Restrict to active or inactive deployments. */
  isActive?: boolean;
}

/** Request body for `client.deployments.create()`. */
export interface CreateDeploymentBody {
  /** Deployment display name (required). */
  name: string;
  /** Channel to publish to (required). */
  type: DeploymentType;
  /** UUID of the agent to serve. */
  agentId?: string;
  /** Free-text description. */
  description?: string;
  /** Channel-specific settings. Shape depends on `type`. */
  settings?: Record<string, unknown>;
}

/** Request body for `client.deployments.update()`. All fields are optional. */
export interface UpdateDeploymentBody {
  /** New display name. */
  name?: string;
  /** New description. Set to `null` to clear it. */
  description?: string | null;
  /** New agent UUID. Set to `null` to unassign. */
  agentId?: string | null;
  /** Channel-specific settings to merge. */
  settings?: Record<string, unknown>;
  /** Whether the deployment serves traffic. */
  isActive?: boolean;
}

/**
 * Request body for `client.deployments.updateEmbedConfig()`. A PATCH: every
 * field is optional and a field you omit keeps its stored value.
 *
 * Symmetric with {@link EmbedConfig} by construction, so a config you read can
 * be edited and sent straight back without a field being unwritable.
 */
export type UpdateEmbedConfigBody = Partial<EmbedConfig>;
