import type {
  AssignSkillToFolderBody,
  AssignSkillToFolderResponse,
  CreateSkillFolderBody,
  ListSkillFoldersResponse,
  SkillFolder,
  UpdateSkillFolderBody
} from "../types/skill-folders";
import { BaseResource } from "./base-resource";

export class SkillFoldersResource extends BaseResource {
  async list(): Promise<ListSkillFoldersResponse> {
    return this.http.request<ListSkillFoldersResponse>("GET", "/skill-folders");
  }

  async create(body: CreateSkillFolderBody): Promise<SkillFolder> {
    return this.http.request<SkillFolder>("POST", "/skill-folders", { body });
  }

  async update(folderId: string, body: UpdateSkillFolderBody): Promise<SkillFolder> {
    return this.http.request<SkillFolder>("PATCH", `/skill-folders/${folderId}`, { body });
  }

  async delete(folderId: string): Promise<{ id: string; deleted: true }> {
    return this.http.request<{ id: string; deleted: true }>("DELETE", `/skill-folders/${folderId}`);
  }

  async assign(body: AssignSkillToFolderBody): Promise<AssignSkillToFolderResponse> {
    return this.http.request<AssignSkillToFolderResponse>("POST", "/skill-folders/assign", {
      body
    });
  }
}
