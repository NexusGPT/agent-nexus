import type { AgentToolConfigType } from "./common";

// ============================================================================
// Agent Tool Config (response shape)
// ============================================================================

/** A tool configuration attached to an agent. Returned by `client.agents.tools.list()` and related methods. */
export interface AgentToolConfig {
  /** Unique tool config UUID. */
  id: string;
  /** Display name for the tool (e.g. "Gmail - Send Email"). */
  label: string;
  /** Description of what this tool does. */
  description: string | null;
  /** URL to the tool's icon. */
  iconUrl: string | null;
  /** Icon type identifier. */
  iconType: string | null;
  /**
   * Tool type.
   *
   * - `"PLUGIN"` — Pipedream marketplace tool (use `client.tools` to discover and configure).
   * - `"WORKFLOW"` — Organization workflow.
   * - `"TASK"` — Organization AI task.
   * - `"COLLECTION"` — Knowledge collection.
   * - `"DOCUMENT_TEMPLATE"` — Document generation template.
   */
  type: AgentToolConfigType;
  /**
   * JSON Schema defining the input the agent must provide when invoking this tool.
   * For PLUGIN tools, this is typically auto-generated from the action's parameter schema.
   */
  agentInputSchema: unknown | null;
  /**
   * Internal tool configuration. For PLUGIN tools this contains:
   * - `toolId` — Marketplace tool ID
   * - `toolCredentialId` — Credential UUID
   * - `parametersSetup` — Pre-configured parameter values
   * - Action selection and other provider-specific settings
   */
  config: unknown | null;
  /** Whether this tool is enabled. Disabled tools are not available to the agent at runtime. */
  isActive: boolean;
  /** When true, the agent does not wait for tool execution to complete — it fires and forgets. */
  fireAndForget: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.agents.tools.create()`. */
export interface CreateAgentToolBody {
  /** Display name for the tool (required). */
  label: string;
  /** Description of what this tool does. */
  description?: string;
  /** URL to the tool's icon. */
  iconUrl?: string;
  /** Icon type identifier. */
  iconType?: string;
  /** Tool type (required). */
  type: AgentToolConfigType;
  /**
   * JSON Schema defining the input the agent must provide when invoking this tool (required).
   * Use `{ type: "object", properties: { ... } }` or `{}` if no input is needed.
   */
  agentInputSchema: unknown;
  /** Internal tool configuration (provider-specific). */
  config?: unknown;
  /** Whether this tool is enabled (default `true`). */
  isActive?: boolean;
  /** When true, the agent does not wait for tool execution to complete (default `false`). */
  fireAndForget?: boolean;
}

/** Request body for `client.agents.tools.attachCollection()`. */
export interface AttachCollectionBody {
  /** The collection's UUID (required). */
  collectionId: string;
  /** Display name for the tool. Defaults to the collection name if omitted. */
  label?: string;
  /** Description of what the tool does. Defaults to the collection description if omitted. */
  description?: string;
  /** Optional instructions for how the agent should use this collection. */
  instructions?: string;
}

/** Request body for `client.agents.tools.update()`. All fields are optional. */
export interface UpdateAgentToolBody {
  /** Display name for the tool. */
  label?: string;
  /** Description of what this tool does. */
  description?: string;
  /** URL to the tool's icon. */
  iconUrl?: string;
  /** Icon type identifier. */
  iconType?: string;
  /** Tool type. */
  type?: AgentToolConfigType;
  /** JSON Schema defining the input the agent must provide when invoking this tool. */
  agentInputSchema?: unknown;
  /** Internal tool configuration (provider-specific). */
  config?: unknown;
  /** Whether this tool is enabled. */
  isActive?: boolean;
  /** When true, the agent does not wait for tool execution to complete. */
  fireAndForget?: boolean;
}
