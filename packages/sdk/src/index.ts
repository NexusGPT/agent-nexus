// Client
export type { NexusClientOptions } from "./client";
export { NexusClient } from "./client";

// Errors
export {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "./errors";

// Resources
export {
  AccessCardsResource,
  AgentCollectionsResource,
  AgentSkillsResource,
  AgentsResource,
  AgentToolsResource,
  AnalyticsResource,
  ApiKeyConnectionsResource,
  AssetsResource,
  CloudImportsResource,
  ConversationsResource,
  CredentialsResource,
  DeploymentFoldersResource,
  DeploymentsResource,
  DocumentsResource,
  DocumentTemplateFoldersResource,
  EmulatorResource,
  EvaluationsResource,
  FoldersResource,
  HtmlMessageTemplatesResource,
  ModelsResource,
  PermissionsResource,
  PromptAssistantResource,
  RolesResource,
  SkillsResource,
  TicketsResource,
  ToolConnectionResource,
  ToolDiscoveryResource,
  UserGroupsResource,
  VersionsResource,
  WorkflowExecutionsResource,
  WorkflowsResource,
  WorkspacesResource
} from "./resources";

// HTTP client (for advanced usage)
export type { HttpClientOptions, RequestOptions } from "./http-client";
export { HttpClient } from "./http-client";

// Types
export type {
  ListPromptAssistantThreadsParams,
  PromptAssistantChatBody,
  PromptAssistantChatResponse,
  PromptAssistantTerminalStatus,
  PromptAssistantThreadMessage,
  PromptAssistantThreadResponse,
  PromptAssistantThreadSummary,
  PromptAssistantWaitUntil,
  PromptResult,
  WaitForThreadOptions,
  WaitForThreadResult
} from "./resources/prompt-assistant";
export {
  isPromptAssistantTerminalStatus,
  PROMPT_ASSISTANT_TERMINAL_STATUSES
} from "./resources/prompt-assistant";
/**
 * Every public type, re-exported wholesale.
 *
 * This was a hand-maintained list of 208 names against the 329 the `types/`
 * barrel declares. The 121 it omitted were not private — they were the argument
 * and return types of methods this package exports, unnameable by the callers
 * that have to pass them. `packages/cli` carried 15 `as any` casts for exactly
 * that reason.
 *
 * `export type *` cannot drift. See the header on `./types` for the same
 * reasoning one level down.
 */
export type * from "./types";
