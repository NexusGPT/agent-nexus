// ============================================================================
// Deployment folder (response shape)
// ============================================================================

/**
 * A folder for organizing deployments. Folders can be nested via `parentId`.
 *
 * Structurally parallel to {@link AgentFolder} but a distinct resource: these
 * group deployments, not agents.
 */
export interface DeploymentFolder {
  /** Unique folder UUID. */
  id: string;
  /** Folder display name. */
  name: string;
  /** URL to the folder's icon. */
  iconUrl: string | null;
  /** Parent folder UUID for nesting, or `null` for root-level folders. */
  parentId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

// ============================================================================
// Assignment
// ============================================================================

/** Represents a deployment's assignment to a folder. */
export interface DeploymentFolderAssignment {
  /**
   * Deployment id.
   *
   * The assignment row stores this as a bare string column with no foreign key,
   * so a historical row can hold a value that is not a well-formed UUID.
   */
  deploymentId: string;
  /** Folder UUID the deployment is assigned to. */
  folderId: string;
}

// ============================================================================
// List response
// ============================================================================

/** Response from `client.deploymentFolders.list()`. */
export interface ListDeploymentFoldersResponse {
  /** All deployment folders in the organization. */
  folders: DeploymentFolder[];
  /** All deployment-to-folder assignments. */
  assignments: DeploymentFolderAssignment[];
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.deploymentFolders.create()`. */
export interface CreateDeploymentFolderBody {
  /** Folder display name (required). */
  name: string;
  /** Parent folder UUID for nesting. Omit for a root-level folder. */
  parentId?: string;
}

/** Request body for `client.deploymentFolders.update()`. All fields are optional. */
export interface UpdateDeploymentFolderBody {
  /** New folder display name. */
  name?: string;
  /** New parent folder UUID. Set to `null` to move to root level. */
  parentId?: string | null;
}

/** Request body for `client.deploymentFolders.assign()`. */
export interface AssignDeploymentToFolderBody {
  /** Deployment UUID to assign. */
  deploymentId: string;
  /** Target folder UUID, or `null` to remove the deployment from its folder. */
  folderId: string | null;
}

// ============================================================================
// Assign response
// ============================================================================

/** Response from `client.deploymentFolders.assign()`. */
export interface AssignDeploymentToFolderResponse {
  /** Deployment id, as stored on the assignment row. */
  deploymentId: string;
  /** Folder UUID the deployment was assigned to, or `null` if removed. */
  folderId: string | null;
  /** Whether the assignment was applied. */
  assigned: boolean;
}
