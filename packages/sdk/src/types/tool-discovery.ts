// ============================================================================
// Marketplace Tool Search
// ============================================================================

/** A marketplace tool summary returned from search results. */
export interface MarketplaceToolItem {
  /** Unique tool ID. Use with `client.tools.get(id)` for full details. */
  id: string;
  /** Display name of the tool (e.g. "Gmail", "Slack"). */
  name: string;
  /** Short description of what the tool does. */
  description: string;
  /** Tool type (e.g. "PLUGIN" for Pipedream-backed tools). */
  type: string;
  /** URL to the tool's icon/logo, if available. */
  imageUrl: string | null;
  /** Category for faceted filtering (e.g. "Communication", "Productivity"). */
  category: string | null;
}

/** Query parameters for `client.tools.search()`. */
export interface SearchMarketplaceToolsParams {
  /** Free-text search query (e.g. "gmail", "send email"). */
  q?: string;
  /** Filter by category (e.g. "Communication"). */
  category?: string;
  /** Filter by tool type (e.g. "PLUGIN"). */
  type?: string;
  /** Max results to return (default 20, max 100). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
}

/** Response from `client.tools.search()`. */
export interface SearchMarketplaceToolsResponse {
  /** Matching tools (paginated). */
  tools: MarketplaceToolItem[];
  /** Category facets with counts for building filter UIs. */
  facets: { category: string; count: number }[];
  /** Total number of matching tools across all pages. */
  total: number;
}

// ============================================================================
// Marketplace Tool Detail
// ============================================================================

/**
 * A parameter on a tool action. Parameters describe the inputs an action accepts.
 *
 * When `remoteOptions` is `true`, the parameter's allowed values must be fetched
 * dynamically via `client.tools.resolveOptions()` — e.g. a Gmail label dropdown
 * whose values depend on the authenticated user's account.
 */
export interface ToolActionParameter {
  /** Parameter name (used as the key in `configuredProps`). */
  name: string;
  /** Data type (e.g. "string", "boolean", "integer", "string[]"). */
  type: string;
  /** Human-readable label for the parameter. */
  label: string | null;
  /** Description of what this parameter controls. */
  description: string | null;
  /** Whether this parameter must be provided for the action to execute. */
  required: boolean;
  /** Default value, if any. */
  default: unknown;
  /**
   * If `true`, the allowed values for this parameter must be fetched at runtime
   * via `client.tools.resolveOptions(toolId, { componentId, propName, credentialId })`.
   * This is common for fields like "select a Gmail label" or "pick a Slack channel"
   * whose options depend on the user's connected account.
   */
  remoteOptions: boolean;
}

/**
 * An action exposed by a marketplace tool. Each action represents a discrete operation
 * (e.g. "Send Email", "Create Draft", "List Labels").
 */
export interface ToolAction {
  /**
   * Unique component key identifying this action (e.g. "gmail-send-email").
   * Use this as `componentId` when calling `client.tools.resolveOptions()`.
   */
  key: string;
  /** Human-readable action name. */
  name: string;
  /** Description of what this action does. */
  description: string | null;
  /** Input parameters this action accepts. */
  parameters: ToolActionParameter[];
}

/** Query parameters for `client.tools.get()` to paginate/filter actions. */
export interface GetToolDetailParams {
  /** Max actions to return (1-200). Omit to return all. */
  actionsLimit?: number;
  /** Offset for action pagination (default 0). */
  actionsOffset?: number;
  /** Filter actions by key, name, or description (case-insensitive substring match). */
  actionsSearch?: string;
}

/**
 * Full marketplace tool detail including actions and their parameter schemas.
 * Returned by `client.tools.get(toolId)`.
 */
export interface MarketplaceToolDetail {
  /** Unique tool ID. */
  id: string;
  /** Display name. */
  name: string | null;
  /** Description of the tool. */
  description: string;
  /** Tool type (e.g. "PLUGIN"). */
  type: string;
  /** URL to the tool's icon/logo. */
  imageUrl: string | null;
  /** Authentication type required (e.g. "oauth", "keys", "none"). */
  authType: string | null;
  /**
   * Actions (operations) this tool exposes. Each action has its own set of
   * parameters. For Pipedream tools, these are enriched with full parameter
   * schemas from the Pipedream component registry.
   *
   * May be paginated — check `totalActions` for the full count.
   */
  actions: ToolAction[];
  /** Total number of actions available (before pagination). */
  totalActions: number;
}

// ============================================================================
// Tool Credentials
// ============================================================================

/** An existing credential (connected account) for a marketplace tool. */
export interface ToolCredential {
  /**
   * Credential UUID. Pass this as `credentialId` to
   * `client.tools.resolveOptions()` or when configuring an agent tool.
   */
  id: string;
  /** Display name of the credential (e.g. "john@company.com"). */
  name: string | null;
  /** Credential/auth type. */
  type: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Response from `client.tools.credentials(toolId)`. */
export interface ListToolCredentialsResponse {
  /** Existing credentials for this tool in the organization. */
  credentials: ToolCredential[];
}

// ============================================================================
// Resolve Remote Options
// ============================================================================

/**
 * Request body for `client.tools.resolveOptions()`.
 *
 * This resolves dynamic dropdown values for a parameter that has `remoteOptions: true`.
 * For example, fetching the list of Gmail labels or Slack channels for the
 * authenticated user.
 */
export interface ResolveRemoteOptionsBody {
  /**
   * The action's component key (from `ToolAction.key`),
   * e.g. "gmail-send-email".
   */
  componentId: string;
  /**
   * The parameter name to resolve options for (from `ToolActionParameter.name`),
   * e.g. "label" or "channel".
   */
  propName: string;
  /**
   * Credential UUID (from `ToolCredential.id`). The credential provides the
   * authenticated account context needed to fetch options.
   */
  credentialId: string;
  /**
   * Already-selected parameter values. Some parameters depend on others
   * (cascading dropdowns) — for example, selecting a Google Drive folder before
   * listing files in that folder. Pass previously selected values here so the
   * API can resolve the correct options.
   */
  configuredProps?: Record<string, unknown>;
}

/** A single option in a dynamic dropdown. */
export interface RemoteOption {
  /** Human-readable display label. */
  label: string;
  /** The value to use when configuring this parameter. */
  value: string | number | boolean;
}

/** Response from `client.tools.resolveOptions()`. */
export interface ResolveRemoteOptionsResponse {
  /** The available options for the requested parameter. */
  options: RemoteOption[];
}

// ============================================================================
// Skills
// ============================================================================

/**
 * A skill is an organization-owned asset that can be attached to an agent:
 * a workflow (automation), an AI task, or a knowledge collection.
 */
export interface SkillItem {
  /** Unique skill ID. */
  id: string;
  /** Display name. */
  name: string | null;
  /** Description of what this skill does. */
  description: string | null;
  /** Skill type: "TASK", "WORKFLOW", or "COLLECTION". */
  type: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Query parameters for `client.tools.skills()`. */
export interface ListSkillsParams {
  /** Filter by skill type. */
  type?: "TASK" | "WORKFLOW" | "COLLECTION";
  /** Free-text search within skill names and descriptions. */
  search?: string;
  /** Max results to return (default 20, max 100). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
}

/** Response from `client.tools.skills()`. */
export interface ListSkillsResponse {
  /** Matching skills (paginated). */
  skills: SkillItem[];
  /** Total number of matching skills. */
  total: number;
}

// ============================================================================
// Test Agent Tool
// ============================================================================

/**
 * Request body for `client.tools.test()`.
 * Provide sample input values to test-execute a configured agent tool.
 */
export interface TestAgentToolBody {
  /** Key-value pairs matching the tool's expected parameters. */
  input: Record<string, unknown>;
}

/** Response from `client.tools.test()`. */
export interface TestAgentToolResponse {
  /** Whether the tool executed successfully. */
  status: "success" | "error";
  /** The tool's output data (shape depends on the specific tool/action). */
  output: unknown;
  /** Error message if `status` is "error". */
  error?: string;
  /** How long the execution took in milliseconds. */
  executionTimeMs: number;
}

// ============================================================================
// Execute Tool Direct
// ============================================================================

/**
 * Request body for `client.tools.execute()`.
 * Execute a tool action directly without building a workflow.
 */
export interface ExecuteToolDirectBody {
  /** The operationId of the action to execute (from the tool's actions config). */
  action: string;
  /** Input parameters for the action. */
  input?: Record<string, unknown>;
  /** Credential ID to use. If omitted, auto-resolves the active credential for this tool. */
  credentialId?: string;
}

/** Response from `client.tools.execute()`. */
export interface ExecuteToolDirectResponse {
  /** Whether the execution succeeded. */
  success: boolean;
  /** The tool ID that was executed. */
  toolId: string;
  /** The action that was executed. */
  action: string;
  /** The execution result data. */
  result: unknown;
}
