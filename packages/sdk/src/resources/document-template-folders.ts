import type { DeleteResponse } from "../types/common";
import type {
  AssignTemplateToFolderBody,
  AssignTemplateToFolderResponse,
  CreateDocumentTemplateFolderBody,
  DocumentTemplateFolder,
  ListDocumentTemplateFoldersResponse,
  UpdateDocumentTemplateFolderBody
} from "../types/document-template-folders";
import { BaseResource } from "./base-resource";

/**
 * Document template folder resource. Accessed via `client.documentTemplateFolders`.
 *
 * Folders group document templates and support nesting via `parentId`. A template
 * is placed in a folder with `assign()`.
 */
export class DocumentTemplateFoldersResource extends BaseResource {
  /**
   * List all document template folders and their assignments.
   *
   * @returns All folders and a flat list of template-to-folder assignments.
   */
  async list(): Promise<ListDocumentTemplateFoldersResponse> {
    return this.http.request<ListDocumentTemplateFoldersResponse>(
      "GET",
      "/document-template-folders"
    );
  }

  /**
   * Create a new document template folder.
   *
   * @param body - Folder properties. `name` is required. Set `parentId` for nesting.
   * @returns The created folder.
   */
  async create(body: CreateDocumentTemplateFolderBody): Promise<DocumentTemplateFolder> {
    return this.http.request<DocumentTemplateFolder>("POST", "/document-template-folders", {
      body
    });
  }

  /**
   * Update a folder's properties.
   *
   * @param folderId - Folder UUID.
   * @param body - Fields to update. Set `parentId` to `null` to move to root level.
   * @returns The updated folder.
   */
  async update(
    folderId: string,
    body: UpdateDocumentTemplateFolderBody
  ): Promise<DocumentTemplateFolder> {
    return this.http.request<DocumentTemplateFolder>(
      "PATCH",
      `/document-template-folders/${folderId}`,
      { body }
    );
  }

  /**
   * Delete a folder. Templates in the folder are unassigned, not deleted.
   *
   * @param folderId - Folder UUID.
   * @returns Confirmation carrying the deleted folder's id.
   */
  async delete(folderId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/document-template-folders/${folderId}`);
  }

  /**
   * Assign a document template to a folder, or remove it from its folder.
   *
   * @param body - Template id and target folder id. Set `folderId` to `null` to unassign.
   * @returns Confirmation of the assignment.
   */
  async assign(body: AssignTemplateToFolderBody): Promise<AssignTemplateToFolderResponse> {
    return this.http.request<AssignTemplateToFolderResponse>(
      "POST",
      "/document-template-folders/assign",
      { body }
    );
  }
}
