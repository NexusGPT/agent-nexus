import type {
  CreateWorkspaceBody,
  DeleteWorkspaceResponse,
  ListWorkspaceFilesParams,
  ListWorkspacesParams,
  ListWorkspacesResponse,
  RenameWorkspaceBody,
  RestoreWorkspaceBody,
  RestoreWorkspaceResponse,
  Workspace,
  WorkspaceFileUrl,
  WorkspaceListing,
  WorkspaceSearchParams,
  WorkspaceSearchResponse
} from "../types/workspaces";
import { BaseResource } from "./base-resource";

/**
 * Workspace management resource. Accessed via `client.workspaces`.
 *
 * Workspaces are shared, org-scoped cloud file drives. This resource covers
 * lifecycle (list/create/rename/delete) and read-only file browsing. To read
 * and write the files themselves as a live drive, mount the workspace with
 * `nexus workspace mount <slug>` (served over WebDAV at `/api/dav`).
 */
export class WorkspacesResource extends BaseResource {
  /**
   * List the organization's workspaces, each with aggregate stats. Pass
   * `{ folderStats: true }` to additionally get a depth-1 per-folder breakdown
   * under each workspace's `stats.folders`.
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

  /** Get a presigned download URL for a single file. */
  async getFileUrl(slug: string, path: string): Promise<WorkspaceFileUrl> {
    return this.http.request<WorkspaceFileUrl>(
      "GET",
      `/workspaces/${encodeURIComponent(slug)}/file`,
      { query: { path } }
    );
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
}
