import type {
  CreateWorkspaceBody,
  DeleteWorkspaceResponse,
  ListWorkspaceFilesParams,
  ListWorkspacesResponse,
  RenameWorkspaceBody,
  Workspace,
  WorkspaceFileUrl,
  WorkspaceListing
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
  /** List the organization's workspaces, each with aggregate stats. */
  async list(): Promise<ListWorkspacesResponse> {
    return this.http.request<ListWorkspacesResponse>("GET", "/workspaces");
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
}
