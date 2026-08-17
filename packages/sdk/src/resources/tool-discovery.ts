import { LONG_RUNNING_TIMEOUT_MS } from "../timeouts";
import type {
  ExecuteToolDirectBody,
  ExecuteToolDirectResponse,
  GetToolDetailParams,
  ListSkillsParams,
  ListSkillsResponse,
  ListToolCredentialsResponse,
  MarketplaceToolDetail,
  ResolveRemoteOptionsBody,
  ResolveRemoteOptionsResponse,
  SearchMarketplaceToolsParams,
  SearchMarketplaceToolsResponse,
  TestAgentToolBody,
  TestAgentToolResponse
} from "../types/tool-discovery";
import { BaseResource } from "./base-resource";

/**
 * Tool discovery and configuration resource.
 *
 * Provides the full LLM tool-configuration workflow:
 *
 * ```
 * 1. search()         — Find marketplace tools (e.g. "gmail")
 * 2. get()            — Get full tool detail with actions & parameter schemas
 * 3. credentials()    — List existing connected accounts for the tool
 * 4. resolveOptions() — Fetch dynamic dropdown values for parameters with remoteOptions
 * 5. skills()         — List org's workflows, AI tasks, and collections
 * 6. test()           — Test-execute a configured agent tool
 * 7. execute()        — Execute a tool action directly (no workflow needed)
 * ```
 *
 * Typical workflow: search → get detail → list credentials → resolve dynamic
 * fields → configure tool on agent (via `client.agents.tools.create()`) → test.
 *
 * Accessed via `client.tools`.
 */
export class ToolDiscoveryResource extends BaseResource {
  /**
   * Search marketplace tools by keyword with optional category and type filters.
   * Uses Typesense full-text search with SQL fallback.
   *
   * @param params - Search query and filters.
   * @returns Matching tools, category facets, and total count.
   *
   * @example
   * ```ts
   * const result = await client.tools.search({ q: "gmail", limit: 5 });
   * console.log(`Found ${result.total} tools`);
   * for (const tool of result.tools) {
   *   console.log(`${tool.name} (${tool.type}): ${tool.description}`);
   * }
   * ```
   */
  async search(params?: SearchMarketplaceToolsParams): Promise<SearchMarketplaceToolsResponse> {
    return this.http.request<SearchMarketplaceToolsResponse>("GET", "/tools/search", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get full marketplace tool detail including actions and their parameter schemas.
   *
   * For Pipedream tools, each action's parameters are enriched with the full
   * component definition including types, descriptions, defaults, and
   * `remoteOptions` flags indicating which fields need dynamic option resolution.
   *
   * @param toolId - Marketplace tool ID (from search results).
   * @param params - Optional pagination/filter params for actions.
   * @returns Full tool detail with actions and parameter schemas.
   *
   * @example
   * ```ts
   * // Get all actions
   * const detail = await client.tools.get("tool-uuid");
   * console.log(`${detail.totalActions} total actions`);
   *
   * // Paginate actions
   * const page = await client.tools.get("tool-uuid", { actionsLimit: 10, actionsOffset: 20 });
   *
   * // Search for a specific action
   * const filtered = await client.tools.get("tool-uuid", { actionsSearch: "get-values" });
   * ```
   */
  async get(toolId: string, params?: GetToolDetailParams): Promise<MarketplaceToolDetail> {
    return this.http.request<MarketplaceToolDetail>("GET", `/tools/${toolId}`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * List existing credentials (connected accounts) for a marketplace tool.
   *
   * Credentials represent authenticated connections (e.g. a Gmail OAuth token).
   * They are read-only through this endpoint — users create credentials via the
   * Nexus dashboard. Use the credential `id` when calling `resolveOptions()` or
   * when configuring an agent tool.
   *
   * @param toolId - Marketplace tool ID.
   * @returns List of credentials for this tool in the organization.
   *
   * @example
   * ```ts
   * const { credentials } = await client.tools.credentials("tool-uuid");
   * if (credentials.length === 0) {
   *   console.log("No credentials — user must connect account in dashboard first");
   * }
   * ```
   */
  async credentials(toolId: string): Promise<ListToolCredentialsResponse> {
    return this.http.request<ListToolCredentialsResponse>("GET", `/tools/${toolId}/credentials`);
  }

  /**
   * Resolve dynamic dropdown options for a tool action parameter.
   *
   * Some parameters (those with `remoteOptions: true` in the tool detail) have
   * values that depend on the user's connected account — for example, a list of
   * Gmail labels or Slack channels. This method fetches those options at runtime.
   *
   * For cascading dependencies (e.g. "select folder" → "select file in folder"),
   * pass previously selected values in `configuredProps`.
   *
   * @param toolId - Marketplace tool ID.
   * @param body - Component ID, parameter name, credential, and current values.
   * @returns Available options for the specified parameter.
   *
   * @example
   * ```ts
   * const { options } = await client.tools.resolveOptions("tool-uuid", {
   *   componentId: "gmail-send-email",   // from ToolAction.key
   *   propName: "label",                  // from ToolActionParameter.name
   *   credentialId: "cred-uuid",          // from ToolCredential.id
   *   configuredProps: {}                  // previously selected values
   * });
   * for (const opt of options) {
   *   console.log(`${opt.label}: ${opt.value}`);
   * }
   * ```
   */
  async resolveOptions(
    toolId: string,
    body: ResolveRemoteOptionsBody
  ): Promise<ResolveRemoteOptionsResponse> {
    return this.http.request<ResolveRemoteOptionsResponse>(
      "POST",
      `/tools/${toolId}/resolve-options`,
      { body }
    );
  }

  /**
   * List the organization's skills — workflows, AI tasks, and collections.
   *
   * Skills are org-owned assets that can be attached to agents as tool
   * configurations of type WORKFLOW, TASK, or COLLECTION (as opposed to
   * marketplace PLUGIN tools).
   *
   * @param params - Optional type filter, search, and pagination.
   * @returns Matching skills and total count.
   *
   * @example
   * ```ts
   * // List all workflows
   * const { skills, total } = await client.tools.skills({ type: "WORKFLOW" });
   * console.log(`${total} workflows found`);
   *
   * // Search across all skill types
   * const result = await client.tools.skills({ search: "onboarding", limit: 10 });
   * ```
   */
  async skills(params?: ListSkillsParams): Promise<ListSkillsResponse> {
    return this.http.request<ListSkillsResponse>("GET", "/tools/skills", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Test-execute a configured agent tool with sample input.
   *
   * This runs the tool using its saved configuration (action, credentials,
   * parameter setup) and returns the execution result. Use this to verify a
   * tool is correctly configured before deploying the agent.
   *
   * @param agentId - Agent UUID that owns the tool config.
   * @param toolConfigId - Agent tool configuration UUID (from `client.agents.tools.list()`).
   * @param body - Sample input values to pass to the tool.
   * @returns Execution result with status, output, and timing.
   *
   * @example
   * ```ts
   * const result = await client.tools.test("agent-uuid", "tool-config-uuid", {
   *   input: { to: "test@example.com", subject: "Hello", body: "Test email" }
   * });
   * if (result.status === "success") {
   *   console.log(`Executed in ${result.executionTimeMs}ms`, result.output);
   * } else {
   *   console.error(`Tool error: ${result.error}`);
   * }
   * ```
   */
  async test(
    agentId: string,
    toolConfigId: string,
    body: TestAgentToolBody
  ): Promise<TestAgentToolResponse> {
    return this.http.request<TestAgentToolResponse>(
      "POST",
      `/agents/${agentId}/tools/${toolConfigId}/test`,
      { body }
    );
  }

  /**
   * Execute a tool action directly without building a workflow.
   *
   * Supports Pipedream and custom-manifest tools. Specify the action
   * operationId, input parameters, and optionally a credential ID.
   * If no credential ID is provided, the first active credential for
   * this tool in the organization is used.
   *
   * @param toolId - Marketplace tool ID.
   * @param body - Action, input parameters, and optional credential.
   * @returns Execution result with success status, tool/action info, and result data.
   *
   * @example
   * ```ts
   * const result = await client.tools.execute("tool-uuid", {
   *   action: "google_sheets-create-spreadsheet",
   *   input: { title: "My Spreadsheet" },
   *   credentialId: "cred-uuid"  // optional
   * });
   * if (result.success) {
   *   console.log(`Executed ${result.action} on ${result.toolId}`, result.result);
   * }
   * ```
   */
  async execute(toolId: string, body: ExecuteToolDirectBody): Promise<ExecuteToolDirectResponse> {
    return this.http.request<ExecuteToolDirectResponse>("POST", `/tools/${toolId}/execute`, {
      body,
      // Runs the action against the third party and answers with its result, so
      // the wait is theirs to decide, not ours.
      timeoutMs: LONG_RUNNING_TIMEOUT_MS
    });
  }
}
