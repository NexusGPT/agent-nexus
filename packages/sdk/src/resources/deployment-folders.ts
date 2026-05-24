import { BaseResource } from "./base-resource";

export class DeploymentFoldersResource extends BaseResource {
  async list(): Promise<any> {
    return this.http.request<any>("GET", "/deployment-folders");
  }

  async create(body: { name: string; parentId?: string }): Promise<any> {
    return this.http.request<any>("POST", "/deployment-folders", { body });
  }

  async update(folderId: string, body: { name?: string; parentId?: string | null }): Promise<any> {
    return this.http.request<any>("PATCH", `/deployment-folders/${folderId}`, { body });
  }

  async delete(folderId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/deployment-folders/${folderId}`);
  }

  async assign(body: { deploymentId: string; folderId: string | null }): Promise<any> {
    return this.http.request<any>("POST", "/deployment-folders/assign", { body });
  }
}
