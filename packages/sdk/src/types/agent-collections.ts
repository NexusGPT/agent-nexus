// ============================================================================
// Agent collection (response shape)
// ============================================================================

/** A knowledge collection attached to an agent. */
export interface AgentCollection {
  /** Collection UUID. */
  id: string;
  /** Internal collection name. */
  name: string;
  /** Name shown in the UI, or `null` when it falls back to `name`. */
  displayName: string | null;
  /** Free-text description, or `null`. */
  description: string | null;
  /** Documents currently in the collection. */
  documentCount: number;
  /** Whether the agent may query this collection. */
  isActive: boolean;
}

// ============================================================================
// Attach / detach
// ============================================================================

/** Request body for `client.agentCollections.attach()` and `detach()`. */
export interface AttachAgentCollectionsBody {
  /** Collection UUIDs to attach or detach. Duplicates are ignored. */
  collectionIds: string[];
}

/**
 * Response from `client.agentCollections.attach()` and `detach()`.
 *
 * `count` is the number of DISTINCT ids in the request, not the number of rows
 * the server changed — attaching an already-attached collection still counts.
 */
export interface AttachAgentCollectionsResponse {
  /** How many distinct collection ids the request carried. */
  count: number;
  /** Those ids, deduplicated. */
  collectionIds: string[];
}
