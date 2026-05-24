import type { DeleteResponse } from "../types/common";
import type {
  AgentFolder,
  AssignAgentToFolderBody,
  AssignAgentToFolderResponse,
  CreateFolderBody,
  ListFoldersResponse,
  UpdateFolderBody
} from "../types/folders";
import { BaseResource } from "./base-resource";

/**
 * Folder management resource. Accessed via `client.folders`.
 *
 * Folders organize agents into groups. They support nesting via `parentId`.
 * Agents are assigned to folders via `assignAgent()`.
 */
export class FoldersResource extends BaseResource {
  /**
   * List all folders and their agent assignments.
   *
   * @returns All folders and a flat list of agent-to-folder assignments.
   */
  async list(): Promise<ListFoldersResponse> {
    return this.http.request<ListFoldersResponse>("GET", "/folders");
  }

  /**
   * Create a new folder for organizing agents.
   *
   * @param body - Folder properties. `name` is required. Set `parentId` for nesting.
   * @returns The created folder.
   */
  async create(body: CreateFolderBody): Promise<AgentFolder> {
    return this.http.request<AgentFolder>("POST", "/folders", { body });
  }

  /**
   * Update a folder's properties.
   *
   * @param folderId - Folder UUID.
   * @param body - Fields to update. Set `parentId` to `null` to move to root level.
   * @returns The updated folder.
   */
  async update(folderId: string, body: UpdateFolderBody): Promise<AgentFolder> {
    return this.http.request<AgentFolder>("PATCH", `/folders/${folderId}`, { body });
  }

  /**
   * Delete a folder. Agents in the folder are unassigned, not deleted.
   *
   * @param folderId - Folder UUID.
   * @returns Confirmation with the deleted folder's ID.
   */
  async delete(folderId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/folders/${folderId}`);
  }

  /**
   * Assign an agent to a folder, or remove from folder.
   *
   * @param body - Agent ID and target folder ID. Set `folderId` to `null` to remove the agent from its folder.
   * @returns Confirmation of the assignment.
   */
  async assignAgent(body: AssignAgentToFolderBody): Promise<AssignAgentToFolderResponse> {
    return this.http.request<AssignAgentToFolderResponse>("POST", "/folders/assign", {
      body
    });
  }
}
