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
/**
 * DERIVED, never restated.
 *
 * This was a hand-maintained list of 32 names against the 40 the resources
 * barrel declares, and the 8 it omitted were not private — `CustomersResource`,
 * `MeResource` and six others were reachable through `client.customers` and
 * unnameable by anyone wanting to construct one over a custom transport, write a
 * typed double against it, or `instanceof` it.
 *
 * `export *` cannot drift. It is the same fix, and the same reasoning, as the
 * `export type * from "./types"` at the foot of this file — that one replaced a
 * list of 208 names against 329.
 *
 * What decides membership is now `./resources` itself: a class it exports is
 * public, a class it does not is not. `BaseResource` is the one deliberate
 * exclusion and its header says so.
 */
export * from "./resources";

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
