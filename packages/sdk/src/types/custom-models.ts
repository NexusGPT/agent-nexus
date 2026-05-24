// ============================================================================
// Custom Model types
// ============================================================================

/** Supported inference protocols for custom model endpoints. */
export type CustomModelProtocol = "openai" | "anthropic" | "google";

/** Custom model summary returned by list/get operations. */
export interface CustomModelSummary {
  /** Unique custom model UUID. */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** API model ID sent in requests (e.g. "llama-3-70b"). */
  modelName: string;
  /** OpenAI-compatible API base URL. */
  baseUrl: string;
  /** Inference protocol. */
  protocol: CustomModelProtocol;
  /** Whether the model is enabled. */
  enabled: boolean;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
}

/** Body for creating a custom model. */
export interface CreateCustomModelBody {
  /** Human-readable display name (1–100 chars). */
  displayName: string;
  /** API model ID sent in requests (1–200 chars). */
  modelName: string;
  /** OpenAI-compatible API base URL (HTTPS only). */
  baseUrl: string;
  /** Inference protocol. Only "openai" currently supported. */
  protocol?: "openai";
  /** API key for the custom endpoint. */
  apiKey: string;
  /** Whether the model is enabled. Defaults to true. */
  enabled?: boolean;
}

/** Body for updating a custom model. All fields optional. */
export interface UpdateCustomModelBody {
  displayName?: string;
  modelName?: string;
  baseUrl?: string;
  protocol?: "openai";
  apiKey?: string;
  enabled?: boolean;
}
