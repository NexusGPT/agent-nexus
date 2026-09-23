import { appendFilePart } from "../multipart";
import { UPLOAD_TIMEOUT_MS } from "../timeouts";
import type {
  CreateWorkspaceBody,
  DeleteWorkspaceResponse,
  ListWorkspaceFilesParams,
  ListWorkspacesParams,
  ListWorkspacesResponse,
  MintWorkspaceMountCredentialsBody,
  RenameWorkspaceBody,
  RestoreWorkspaceBody,
  RestoreWorkspaceResponse,
  Workspace,
  WorkspaceFileHistoryParams,
  WorkspaceFileHistoryResponse,
  WorkspaceFileUrl,
  WorkspaceFolderArchiveParams,
  WorkspaceListing,
  WorkspaceMountCredentials,
  WorkspaceRevertBody,
  WorkspaceRevertResponse,
  WorkspaceSearchParams,
  WorkspaceSearchResponse,
  WorkspaceUploadBatchFile,
  WorkspaceUploadBatchOptions,
  WorkspaceUploadBatchResponse
} from "../types/workspaces";
import { BaseResource } from "./base-resource";

/**
 * Workspace management resource. Accessed via `client.workspaces`.
 *
 * Workspaces are shared, org-scoped cloud file drives. This resource covers
 * lifecycle (list/create/rename/delete), read-only file browsing, and three
 * writes: {@link uploadBatch} for putting files in without a mount,
 * {@link restore} for a deleted file, and {@link revert} for an earlier
 * version of a live one ({@link history} lists the versions). To read and
 * write the files as a live drive, mount the workspace with
 * `nexus workspace mount <slug>`.
 */
export class WorkspacesResource extends BaseResource {
  /**
   * List the workspaces THIS KEY can reach, each with aggregate stats.
   *
   * ⚠️ NOT THE ORGANIZATION'S WHOLE SET. A `RoleWorkspaceGrant` that narrows the
   * caller drops the workspaces it narrows out, so this answer matches what the
   * same caller could actually open — two keys in one organization legitimately
   * receive different lists, and a shorter one is not evidence a workspace was
   * deleted.
   *
   * Pass `{ folderStats: true }` to additionally get a depth-1 per-folder
   * breakdown under each workspace's `stats.folders`.
   */
  async list(params?: ListWorkspacesParams): Promise<ListWorkspacesResponse> {
    return this.http.request<ListWorkspacesResponse>("GET", "/workspaces", {
      query: params?.folderStats ? { include: "folder-stats" } : undefined
    });
  }

  /** Create a new workspace. The slug is derived from `name` at creation. */
  async create(body: CreateWorkspaceBody): Promise<Workspace> {
    return this.http.request<Workspace>("POST", "/workspaces", { body });
  }

  /** Rename a workspace. The slug stays immutable; only `name` changes. */
  async rename(slug: string, body: RenameWorkspaceBody): Promise<Workspace> {
    return this.http.request<Workspace>("PATCH", `/workspaces/${encodeURIComponent(slug)}`, {
      body
    });
  }

  /** Delete a workspace and purge all of its files. */
  async delete(slug: string): Promise<DeleteWorkspaceResponse> {
    return this.http.request<DeleteWorkspaceResponse>(
      "DELETE",
      `/workspaces/${encodeURIComponent(slug)}`
    );
  }

  /** List files and folders at a path within a workspace. */
  async listFiles(slug: string, params?: ListWorkspaceFilesParams): Promise<WorkspaceListing> {
    return this.http.request<WorkspaceListing>(
      "GET",
      `/workspaces/${encodeURIComponent(slug)}/files`,
      { query: params as Record<string, string | number | undefined> | undefined }
    );
  }

  /**
   * Get a presigned download URL for a single file. `workspaceId` picks the
   * same-slug twin (org-owned vs admin-shared) the bare slug would not.
   */
  async getFileUrl(
    slug: string,
    path: string,
    options: { workspaceId?: string } = {}
  ): Promise<WorkspaceFileUrl> {
    return this.http.request<WorkspaceFileUrl>(
      "GET",
      `/workspaces/${encodeURIComponent(slug)}/file`,
      { query: { path, workspaceId: options.workspaceId } }
    );
  }

  /**
   * A folder and its subtree as one ZIP, handed back as the `Response` ITSELF,
   * unread — consume `body` as a stream and write it to disk; an archive may be
   * up to 2 GB and must never be buffered. The server refuses an empty folder
   * (400) and one past its caps (413) before the first byte, so a non-2xx
   * throws the usual typed error here. `nexus workspace pull` is the worked
   * consumer: it streams this to a file and unpacks it with the system `unzip`.
   */
  async downloadFolderArchive(
    slug: string,
    params: WorkspaceFolderArchiveParams = {}
  ): Promise<Response> {
    return this.http.openStream("GET", `/workspaces/${encodeURIComponent(slug)}/folder-archive`, {
      query: { path: params.path, workspaceId: params.workspaceId }
    });
  }

  /**
   * Search the workspace's text docs server-side by keyword and/or frontmatter
   * — one call, no mount and no recursive client-side glob. Returns matching
   * paths with snippets and parsed frontmatter. At least one of `query` /
   * `frontmatter` must be provided. `frontmatter` filters are `key=value`
   * strings (all must hold); `path` scopes the search to a subfolder.
   */
  async search(slug: string, params: WorkspaceSearchParams): Promise<WorkspaceSearchResponse> {
    return this.http.request<WorkspaceSearchResponse>(
      "GET",
      `/workspaces/${encodeURIComponent(slug)}/search`,
      {
        query: {
          query: params.query,
          frontmatter: params.frontmatter,
          path: params.path,
          limit: params.limit
        }
      }
    );
  }

  /**
   * Restore a soft-deleted file or folder from the S3 backup. `path` is the
   * deleted file or folder; everything currently deleted at/under it is
   * recovered (live files are left untouched). The recovery window is bounded
   * by backup retention (~30 days, covering the 72h soft-delete window).
   */
  async restore(slug: string, body: RestoreWorkspaceBody): Promise<RestoreWorkspaceResponse> {
    return this.http.request<RestoreWorkspaceResponse>(
      "POST",
      `/workspaces/${encodeURIComponent(slug)}/restore`,
      { body }
    );
  }

  /**
   * One file's version history, newest first, inside the bucket's retention
   * window (~30 days for noncurrent versions). A `file` entry carries bytes and
   * a size; a `delete-marker` is the tombstone a delete wrote and carries none.
   * `isLatest` marks what the path resolves to today. Empty for a path that
   * never held an object. Pass `workspaceId` to name the same-slug twin.
   */
  async history(
    slug: string,
    path: string,
    params: WorkspaceFileHistoryParams = {}
  ): Promise<WorkspaceFileHistoryResponse> {
    return this.http.request<WorkspaceFileHistoryResponse>(
      "GET",
      `/workspaces/${encodeURIComponent(slug)}/history`,
      { query: { path, workspaceId: params.workspaceId } }
    );
  }

  /**
   * Make an earlier version of a file live again: the version named by
   * `versionId` (from {@link history}) is copied on top of `path` as a NEW
   * version, so nothing is destroyed and a revert is undone by reverting
   * again. Works on a deleted file too — the last `file` version comes back.
   * Refused: a `delete-marker` id (400), an id the path never held (404), a
   * name that is a folder today (409), a CODE workspace or an ungranted shared
   * one (403), and — 412 — a head that changed between your `history` call and
   * this one: the copy carries that head as its precondition, so a concurrent
   * write, delete or revert is never displaced; list again and retry. The
   * version already live answers `already-live` and writes nothing.
   */
  async revert(slug: string, body: WorkspaceRevertBody): Promise<WorkspaceRevertResponse> {
    return this.http.request<WorkspaceRevertResponse>(
      "POST",
      `/workspaces/${encodeURIComponent(slug)}/revert`,
      { body }
    );
  }

  /**
   * Upload up to 100 files in one request, each to the workspace-relative
   * `path` it names. A path that exists is replaced, like `cp`; with
   * `noClobber` it is reported as skipped instead, decided by the store in the
   * same step as the write — two callers racing on one path see exactly one
   * succeed. Per-file outcome, never all-or-nothing: a refused file does not
   * undo the others, so read `results` rather than treating the call as one
   * write. The request body is capped by the edge, so keep a batch well under
   * 50 MB; `nexus workspace push` packs at 45 MB / 100 files.
   */
  async uploadBatch(
    slug: string,
    files: readonly WorkspaceUploadBatchFile[],
    options: WorkspaceUploadBatchOptions = {}
  ): Promise<WorkspaceUploadBatchResponse> {
    const formData = new FormData();
    formData.append("paths", JSON.stringify(files.map((entry) => entry.path)));
    if (options.workspaceId !== undefined) formData.append("workspaceId", options.workspaceId);
    if (options.noClobber) formData.append("noClobber", "true");
    for (const entry of files) appendFilePart(formData, "files", entry.file, entry.fileName);
    return this.http.request<WorkspaceUploadBatchResponse>(
      "POST",
      `/workspaces/${encodeURIComponent(slug)}/upload-batch`,
      { body: formData, timeoutMs: UPLOAD_TIMEOUT_MS }
    );
  }

  /**
   * Mint the credential a DIRECT mount of this workspace signs S3 requests
   * with: a one-hour STS bearer session whose policy reaches exactly
   * `storage.bucket/storage.prefix` (`<slug>/`) and no other key.
   *
   * `access` is the CEILING asked for (default `read-write`), never a promise.
   * The server grades it down to what the key's scopes, the workspace kind and
   * the shared write grant allow, and the response's `access` says what was
   * granted — a downgrade is an ordinary response, not a refusal.
   *
   * 🚨 THE RESULT IS A CREDENTIAL. AWS honours it until `expiresAt` whatever
   * happens to the API key afterwards, so never log the response and never
   * persist it outside an owner-only file.
   */
  async mintMountCredentials(
    slug: string,
    body: MintWorkspaceMountCredentialsBody = {}
  ): Promise<WorkspaceMountCredentials> {
    return this.http.request<WorkspaceMountCredentials>(
      "POST",
      `/workspaces/${encodeURIComponent(slug)}/mount-credentials`,
      { body }
    );
  }
}
