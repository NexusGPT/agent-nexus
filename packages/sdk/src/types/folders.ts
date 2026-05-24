// ============================================================================
// Folder (response shape)
// ============================================================================

/** A folder for organizing agents. Folders can be nested via `parentId`. */
export interface AgentFolder {
  /** Unique folder UUID. */
  id: string;
  /** Folder display name. */
  name: string;
  /** URL to the folder's icon. */
  iconUrl: string | null;
  /** Parent folder ID for nesting, or `null` for root-level folders. */
  parentId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

// ============================================================================
// Folder assignment
// ============================================================================

/** Represents an agent's assignment to a folder. */
export interface FolderAssignment {
  /** Agent UUID. */
  agentId: string;
  /** Folder UUID the agent is assigned to. */
  folderId: string;
}

// ============================================================================
// List response
// ============================================================================

/** Response from `client.folders.list()`. */
export interface ListFoldersResponse {
  /** All folders in the organization. */
  folders: AgentFolder[];
  /** All agent-to-folder assignments. */
  assignments: FolderAssignment[];
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.folders.create()`. */
export interface CreateFolderBody {
  /** Folder display name (required). */
  name: string;
  /** Parent folder UUID for nesting. Omit for a root-level folder. */
  parentId?: string;
}

/** Request body for `client.folders.update()`. All fields are optional. */
export interface UpdateFolderBody {
  /** New folder display name. */
  name?: string;
  /** New parent folder UUID. Set to `null` to move to root level. */
  parentId?: string | null;
}

/** Request body for `client.folders.assignAgent()`. */
export interface AssignAgentToFolderBody {
  /** Agent UUID to assign. */
  agentId: string;
  /** Target folder UUID, or `null` to remove the agent from its folder. */
  folderId: string | null;
}

// ============================================================================
// Assign response
// ============================================================================

/** Response from `client.folders.assignAgent()`. */
export interface AssignAgentToFolderResponse {
  /** Agent UUID. */
  agentId: string;
  /** Folder UUID the agent was assigned to, or `null` if removed. */
  folderId: string | null;
  /** Whether the assignment was successful. */
  assigned: boolean;
}
