import type { DeleteResponse } from "../types/common";
import type {
  AssignDeploymentToFolderBody,
  AssignDeploymentToFolderResponse,
  CreateDeploymentFolderBody,
  DeploymentFolder,
  ListDeploymentFoldersResponse,
  UpdateDeploymentFolderBody
} from "../types/deployment-folders";
import { BaseResource } from "./base-resource";

/**
 * Deployment folder resource. Accessed via `client.deploymentFolders`.
 *
 * Folders group deployments and support nesting via `parentId`. A deployment is
 * placed in a folder with `assign()`.
 */
export class DeploymentFoldersResource extends BaseResource {
  /**
   * List all deployment folders and their assignments.
   *
   * @returns All folders and a flat list of deployment-to-folder assignments.
   */
  async list(): Promise<ListDeploymentFoldersResponse> {
    return this.http.request<ListDeploymentFoldersResponse>("GET", "/deployment-folders");
  }

  /**
   * Create a new deployment folder.
   *
   * @param body - Folder properties. `name` is required. Set `parentId` for nesting.
   * @returns The created folder.
   */
  async create(body: CreateDeploymentFolderBody): Promise<DeploymentFolder> {
    return this.http.request<DeploymentFolder>("POST", "/deployment-folders", { body });
  }

  /**
   * Update a folder's properties.
   *
   * @param folderId - Folder UUID.
   * @param body - Fields to update. Set `parentId` to `null` to move to root level.
   * @returns The updated folder.
   */
  async update(folderId: string, body: UpdateDeploymentFolderBody): Promise<DeploymentFolder> {
    return this.http.request<DeploymentFolder>("PATCH", `/deployment-folders/${folderId}`, {
      body
    });
  }

  /**
   * Delete a folder. Deployments in the folder are unassigned, not deleted.
   *
   * @param folderId - Folder UUID.
   * @returns Confirmation carrying the deleted folder's id.
   */
  async delete(folderId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/deployment-folders/${folderId}`);
  }

  /**
   * Assign a deployment to a folder, or remove it from its folder.
   *
   * @param body - Deployment id and target folder id. Set `folderId` to `null` to unassign.
   * @returns Confirmation of the assignment.
   */
  async assign(body: AssignDeploymentToFolderBody): Promise<AssignDeploymentToFolderResponse> {
    return this.http.request<AssignDeploymentToFolderResponse>(
      "POST",
      "/deployment-folders/assign",
      { body }
    );
  }
}
