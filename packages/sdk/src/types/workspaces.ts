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
  /**
   * True for admin-configured workspaces shared across all organizations. A
   * shared workspace and an org-owned one can share a slug; when they do, the
   * bare slug resolves to the org-owned copy — use `id` (or `nexus workspace
   * mount --shared`) to reach the shared one.
   */
  isShared: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Per-top-level-folder (depth-1) rollup, returned only when folder stats are requested. */
export interface WorkspaceFolderStats {
  /** Top-level folder name, no slashes. */
  path: string;
  fileCount: number;
  totalBytes: number;
  /** ISO 8601 of the newest file in the folder, or `null` if it holds no files. */
  lastModifiedAt: string | null;
}

/** Aggregate stats shown on the workspace list. */
export interface WorkspaceStats {
  fileCount: number;
  totalBytes: number;
  /** ISO 8601, or `null` for an empty workspace. */
  lastModifiedAt: string | null;
  /**
   * Per-top-level-folder breakdown, sorted by `path`. Present only when
   * `list({ folderStats: true })` was requested; omitted otherwise.
   */
  folders?: WorkspaceFolderStats[];
}

/** A workspace plus its aggregate stats (the `list` shape). */
export interface WorkspaceSummary extends Workspace {
  stats: WorkspaceStats;
}

/** Response from `client.workspaces.list()`. */
export interface ListWorkspacesResponse {
  workspaces: WorkspaceSummary[];
}

/** Options for `client.workspaces.list()`. */
export interface ListWorkspacesParams {
  /**
   * Include a depth-1 per-folder breakdown under each workspace's
   * `stats.folders`. Off by default to keep the response small.
   */
  folderStats?: boolean;
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

/** Options for `client.workspaces.search()`. At least one of `query`/`frontmatter` is required. */
export interface WorkspaceSearchParams {
  /** Free-text keyword (case-insensitive substring over content, frontmatter, and path). */
  query?: string;
  /** One or more `key=value` frontmatter constraints; ALL must hold. */
  frontmatter?: string[];
  /** Restrict the search to a subfolder (workspace-relative). Omit to search the whole workspace. */
  path?: string;
  /** Max hits to return (1–200, default 50). */
  limit?: number;
}

/** A single search hit (`client.workspaces.search()`). */
export interface WorkspaceSearchHit {
  /** Workspace-relative path, no leading slash. */
  path: string;
  size: number;
  modifiedAt: string;
  /** Excerpt around the match, or `null` when the match was frontmatter/path only. */
  snippet: string | null;
  /** Parsed frontmatter of the doc, or `null` when it has none. */
  frontmatter: Record<string, string> | null;
  /** Where the query/filters matched. */
  matchedIn: ("content" | "frontmatter" | "path")[];
}

/** Response from `client.workspaces.search()`. */
export interface WorkspaceSearchResponse {
  results: WorkspaceSearchHit[];
  /** Number of files actually read and inspected server-side. */
  scanned: number;
  /** True when the candidate set exceeded the scan cap, so results may be incomplete. */
  truncated: boolean;
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

/** Request body for `client.workspaces.restore()`. */
export interface RestoreWorkspaceBody {
  /** A deleted file path or folder prefix, relative to the workspace root. */
  path: string;
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
}

/** Response from `client.workspaces.restore()`. */
export interface RestoreWorkspaceResponse {
  /** Workspace-relative paths of the files brought back (folder markers excluded). */
  restored: string[];
  /** Convenience count of `restored.length`. */
  count: number;
}
