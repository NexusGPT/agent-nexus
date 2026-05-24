// ============================================================================
// Model Summary (list endpoint)
// ============================================================================

/**
 * Thinking / reasoning dialect supported by a model.
 *
 * Each dialect maps to a single provider request shape — see the platform
 * documentation for the full taxonomy.
 */
export type ThinkingDialect =
  | "anthropic-legacy"
  | "anthropic-adaptive"
  | "openai-reasoning"
  | "gemini-budget"
  | "gemini-level";

/** Model summary returned by `client.models.list()`. */
export interface ModelSummary {
  /** Unique model UUID. */
  id: string;
  /** Model identifier used in agent create/update (e.g. "GPT_4_1"). */
  modelId: string;
  /** Model provider (e.g. "OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "CUSTOM_OPENAI"). */
  provider: string;
  /** Human-readable display name (e.g. "GPT-4.1"). */
  displayName: string;
  /** API model name sent to the provider. */
  modelName: string;
  /** Context window size in tokens, or null if unknown. */
  contextSize: number | null;
  /** Whether the model supports streaming responses. */
  streaming: boolean;
  /**
   * Thinking / reasoning dialect for this model.
   *
   * Absent or `null` ⇒ the model does not support any form of thinking.
   * Replaces the legacy boolean flags `supportsThinking` and `supportsReasoning`,
   * which are still emitted (derived from this field) for backward compatibility.
   */
  thinkingDialect?: ThinkingDialect | null;
  /**
   * @deprecated Use `thinkingDialect` instead. Derived as
   * `thinkingDialect?.startsWith("anthropic-")`. Will be removed in the next major SDK release.
   */
  supportsThinking: boolean;
  /**
   * @deprecated Use `thinkingDialect` instead. Derived as
   * `thinkingDialect === "openai-reasoning"`. Will be removed in the next major SDK release.
   */
  supportsReasoning: boolean;
  /** Whether the model is deprecated. */
  deprecated: boolean;
  /** Whether this is a system-provided or custom model. */
  source: "system" | "custom";
}
