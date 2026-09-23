// ============================================================================
// Workspace (response shapes)
// ============================================================================

/**
 * What a workspace is backed by.
 *
 * `DRIVE` is the ordinary read-write file drive. `CODE` is a READ-ONLY
 * projection of a git project: the repository is the source of truth and the
 * server refuses every mutating verb against it, on the REST API and on the
 * WebDAV mount alike.
 *
 * This module is type-only (`types/index.ts` is `export type *`), so the
 * read-only CLASSIFICATION is not here — a consumer that needs to predict the
 * server's refusal keys its own exhaustive table on this union, and the CLI's
 * `WORKSPACE_KIND_IS_READ_ONLY` is the worked example.
 */
export type WorkspaceKind = "DRIVE" | "CODE";

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
   *
   * 🚨 OWNERSHIP, NEVER WRITABILITY. A shared workspace is admin-managed and
   * read+write for every org; `kind` is the read-only axis and the two are
   * independent.
   */
  isShared: boolean;
  /**
   * What the workspace is backed by. `CODE` is read-only — see `WorkspaceKind`.
   * On the wire since the field was added to `WorkspaceItemSchema`; it was
   * absent from this interface for long enough that `nexus workspace mount`
   * could not see it and mounted a CODE workspace read-write.
   */
  kind: WorkspaceKind;
  /** The git project this workspace projects. Non-null exactly when `kind` is `CODE`. */
  vibeGitProjectId: string | null;
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

/** Options for `client.workspaces.downloadFolderArchive()`. */
export interface WorkspaceFolderArchiveParams {
  /** Folder path relative to the workspace root; the whole workspace when omitted. */
  path?: string;
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
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

/** Options for `client.workspaces.history()`. */
export interface WorkspaceFileHistoryParams {
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
}

/**
 * One entry of a file's version history. A `file` version carries bytes; a
 * `delete-marker` is the tombstone a delete wrote on top and carries none.
 * `isLatest` marks what the path resolves to today — a `delete-marker` there
 * means the file is currently deleted.
 */
export type WorkspaceFileVersion =
  | {
      kind: "file";
      versionId: string;
      isLatest: boolean;
      size: number;
      modifiedAt: string;
      /** The store's entity tag for these bytes — the same `etag` a folder listing reports. */
      etag: string;
    }
  | {
      kind: "delete-marker";
      versionId: string;
      isLatest: boolean;
      modifiedAt: string;
    };

/** Response from `client.workspaces.history()`. */
export interface WorkspaceFileHistoryResponse {
  /** Newest first. Empty when the path never held an object inside the retention window. */
  versions: WorkspaceFileVersion[];
}

/** Request body for `client.workspaces.revert()`. */
export interface WorkspaceRevertBody {
  /** The file, relative to the workspace root. */
  path: string;
  /** A `file` version id from `history()`; a `delete-marker` id is refused. */
  versionId: string;
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
}

/**
 * Response from `client.workspaces.revert()`. `written` is the ordinary
 * answer; `already-live` means the named version was the head already, so
 * nothing was written — not an error, so reverting twice is safe.
 */
export type WorkspaceRevertResponse =
  | {
      outcome: "written";
      path: string;
      /** The version whose bytes are live again. */
      revertedTo: string;
      /** The id of the new version the revert wrote on top. */
      newVersionId: string;
    }
  | {
      outcome: "already-live";
      path: string;
      revertedTo: string;
    };

/** One file of a `client.workspaces.uploadBatch()` call. */
export interface WorkspaceUploadBatchFile {
  /** Workspace-relative destination, no leading slash. Replaced if it exists, unless `noClobber`. */
  path: string;
  file: Blob | File;
  /** Name to send the part under; a `File` keeps its own when omitted. The server reads `path`, not this. */
  fileName?: string;
}

/** Options for `client.workspaces.uploadBatch()`. */
export interface WorkspaceUploadBatchOptions {
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
  /**
   * Skip a path that already exists instead of replacing it. Checked by the
   * store in the same step as the write, so it holds under concurrent writers.
   */
  noClobber?: boolean;
}

/**
 * One row of `client.workspaces.uploadBatch()`. `skipped` is only ever true
 * under `noClobber`: the path existed, nothing was written, nothing went wrong.
 */
export type WorkspaceUploadResult =
  | { path: string; success: true; size: number; modifiedAt: string }
  | { path: string; success: false; skipped: false; error: string }
  | { path: string; success: false; skipped: true; error: string };

/** Response from `client.workspaces.uploadBatch()`. The three counts partition `results`. */
export interface WorkspaceUploadBatchResponse {
  results: WorkspaceUploadResult[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

/** The access a mount credential carries. `read-write` includes delete. */
export type WorkspaceMountAccess = "read" | "read-write";

/** Request body for `client.workspaces.mintMountCredentials()`. */
export interface MintWorkspaceMountCredentialsBody {
  /** Optional immutable row id to disambiguate same-slug org/shared workspaces. */
  workspaceId?: string;
  /**
   * The CEILING asked for, never a promise. Defaults to `read-write` server-side;
   * the server grades it down to what the key's scopes, the workspace kind and
   * the shared write grant allow, and the response's `access` says what was
   * granted. A downgrade is an ordinary response, not a refusal.
   */
  access?: WorkspaceMountAccess;
}

/**
 * Response from `client.workspaces.mintMountCredentials()`.
 *
 * 🚨 `credentials` IS A BEARER SECRET. AWS honours the triplet until
 * `expiresAt` whatever happens to the API key afterwards — there is no revoke
 * call — so never log it and never persist it outside an owner-only file.
 */
export interface WorkspaceMountCredentials {
  /** The workspace the credential reaches — the resolved copy, never the request's. `name` is what a mount labels the volume with. */
  workspace: Pick<Workspace, "id" | "slug" | "name" | "kind" | "isShared">;
  /**
   * The ACTING organization — the one whose key is mounting, which for a shared
   * (ownerless) workspace is not an owner. Label a drive from this rather than
   * from anything the client cached at sign-in: `name` is what the server holds
   * NOW, so it survives a rename. `null` when no row answered; fall back to
   * whatever name you already had rather than showing none.
   */
  organization: { id: string; name: string | null };
  /** GRANTED access — may be lower than the `access` the body requested. */
  access: WorkspaceMountAccess;
  storage: {
    bucket: string;
    /** Always `<slug>/`: the one key prefix the credentials reach. */
    prefix: string;
    region: string;
  };
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
  /** ISO 8601 instant after which AWS refuses the triplet. */
  expiresAt: string;
}
