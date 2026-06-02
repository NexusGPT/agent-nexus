// ============================================================================
// Workspace (response shapes)
// ============================================================================

/** A workspace — a shared, org-scoped cloud file drive. */
export interface Workspace {
  /** Unique workspace UUID. */
  id: string;
  /** Human-readable name (mutable). */
  name: string;
  /** URL-safe slug (immutable; used as the mount/path key). */
  slug: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Aggregate stats shown on the workspace list. */
export interface WorkspaceStats {
  fileCount: number;
  totalBytes: number;
  /** ISO 8601, or `null` for an empty workspace. */
  lastModifiedAt: string | null;
}

/** A workspace plus its aggregate stats (the `list` shape). */
export interface WorkspaceSummary extends Workspace {
  stats: WorkspaceStats;
}

/** Response from `client.workspaces.list()`. */
export interface ListWorkspacesResponse {
  workspaces: WorkspaceSummary[];
}

/** A file entry within a workspace folder listing. */
export interface WorkspaceFileEntry {
  /** Path relative to the workspace root, no leading slash. */
  path: string;
  size: number;
  modifiedAt: string;
  etag?: string;
}

/** A subfolder entry within a workspace folder listing. */
export interface WorkspaceFolderEntry {
  /** Single path segment (no slashes). */
  name: string;
}

/** Response from `client.workspaces.listFiles()`. */
export interface WorkspaceListing {
  folders: WorkspaceFolderEntry[];
  files: WorkspaceFileEntry[];
  hasMore: boolean;
  nextToken?: string;
}

/** Response from `client.workspaces.getFileUrl()`. */
export interface WorkspaceFileUrl {
  url: string;
}

// ============================================================================
// Request bodies / params
// ============================================================================

/** Request body for `client.workspaces.create()`. */
export interface CreateWorkspaceBody {
  name: string;
}

/** Request body for `client.workspaces.rename()`. */
export interface RenameWorkspaceBody {
  name: string;
}

/** Query params for `client.workspaces.listFiles()`. */
export interface ListWorkspaceFilesParams {
  /** Folder path relative to the workspace root (defaults to root). */
  path?: string;
  /** Pagination token from a previous listing. */
  continuationToken?: string;
}

/** Confirmation returned by `client.workspaces.delete()`. */
export interface DeleteWorkspaceResponse {
  deleted: true;
}
