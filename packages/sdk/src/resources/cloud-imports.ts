import { BaseResource } from "./base-resource";

export class CloudImportsResource extends BaseResource {
  // Google Drive
  async googleDriveAuth(body: { code: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/google-drive/auth", { body });
  }

  async googleDriveRefresh(body: { refreshToken: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/google-drive/refresh", { body });
  }

  async listGoogleDriveFiles(params: {
    accessToken: string;
    folderId?: string;
    pageToken?: string;
  }): Promise<any> {
    return this.http.request<any>("GET", "/documents/google-drive/files", {
      query: params as Record<string, string | undefined>
    });
  }

  async importGoogleDrive(body: {
    accessToken: string;
    fileIds: string[];
    parentId?: string;
  }): Promise<any> {
    return this.http.request<any>("POST", "/documents/google-drive/import", { body });
  }

  // SharePoint
  async sharePointAuth(body: { code: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/sharepoint/auth", { body });
  }

  async sharePointRefresh(body: { refreshToken: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/sharepoint/refresh", { body });
  }

  async listSharePointSites(params: { connectionId: string }): Promise<any> {
    return this.http.request<any>("GET", "/documents/sharepoint/sites", {
      query: params as Record<string, string>
    });
  }

  async listSharePointFiles(params: {
    connectionId: string;
    siteId: string;
    folderId?: string;
  }): Promise<any> {
    return this.http.request<any>("GET", "/documents/sharepoint/files", {
      query: params as Record<string, string | undefined>
    });
  }

  async importSharePoint(body: {
    connectionId: string;
    siteId: string;
    fileIds: string[];
    parentId?: string;
  }): Promise<any> {
    return this.http.request<any>("POST", "/documents/sharepoint/import", { body });
  }

  // Notion
  async notionAuth(body: { code: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/notion/auth", { body });
  }

  async searchNotion(params: {
    connectionId: string;
    query?: string;
    filter?: string;
    cursor?: string;
  }): Promise<any> {
    return this.http.request<any>("GET", "/documents/notion/search", {
      query: params as Record<string, string | undefined>
    });
  }

  async importNotion(body: {
    connectionId: string;
    pageIds?: string[];
    databaseIds?: string[];
    parentId?: string;
  }): Promise<any> {
    return this.http.request<any>("POST", "/documents/notion/import", { body });
  }
}
