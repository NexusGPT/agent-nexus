import { BaseResource } from "./base-resource";

export class DocumentTemplateFoldersResource extends BaseResource {
  async list(): Promise<any> {
    return this.http.request<any>("GET", "/document-template-folders");
  }

  async create(body: { name: string; parentId?: string }): Promise<any> {
    return this.http.request<any>("POST", "/document-template-folders", { body });
  }

  async update(folderId: string, body: { name?: string; parentId?: string | null }): Promise<any> {
    return this.http.request<any>("PATCH", `/document-template-folders/${folderId}`, { body });
  }

  async delete(folderId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/document-template-folders/${folderId}`);
  }

  async assign(body: { templateId: string; folderId: string | null }): Promise<any> {
    return this.http.request<any>("POST", "/document-template-folders/assign", { body });
  }
}
