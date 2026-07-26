import type {
  BrowseCloudItemsParams,
  CloudImportProviderList,
  CloudImportProviderSlug,
  CloudItemPage,
  ImportCloudItemsParams,
  ImportResult,
  SearchCloudItemsParams
} from "../types/cloud-imports";
import { BaseResource } from "./base-resource";

/**
 * Cloud import resource — browse, search and import from Google Drive,
 * SharePoint and Notion through an existing OAuth connection.
 *
 * Accessed via `client.cloudImports`.
 *
 * Everything here works from a `connectionId`; no method takes or returns an
 * access token. The deprecated methods at the bottom of this class do, and they
 * reach endpoints that return fabricated data — see each one's note.
 */
export class CloudImportsResource extends BaseResource {
  /**
   * List the providers that can be browsed, and what each one supports.
   *
   * Read `supportsSearch` before calling {@link search}: a provider may be
   * browsable without being searchable.
   *
   * @example
   * ```ts
   * const { providers } = await client.cloudImports.listProviders();
   * const searchable = providers.filter((p) => p.supportsSearch);
   * ```
   */
  async listProviders(): Promise<CloudImportProviderList> {
    return this.http.request<CloudImportProviderList>("GET", "/documents/imports/providers");
  }

  /**
   * List the contents of a folder or container.
   *
   * @param provider - `"google-drive"`, `"sharepoint"` or `"notion"`.
   * @param params - Connection, container, and optional page token.
   *
   * @example
   * ```ts
   * let pageToken: string | undefined;
   * do {
   *   const page = await client.cloudImports.browse("google-drive", {
   *     connectionId,
   *     folderId: "root",
   *     pageToken
   *   });
   *   for (const item of page.items) console.log(item.name, item.isFolder);
   *   pageToken = page.nextPageToken;
   * } while (pageToken);
   * ```
   */
  async browse(
    provider: CloudImportProviderSlug,
    params: BrowseCloudItemsParams
  ): Promise<CloudItemPage> {
    return this.http.request<CloudItemPage>("GET", `/documents/imports/${provider}/items`, {
      query: { ...params }
    });
  }

  /**
   * Search a provider by file name.
   *
   * Throws for a provider whose search is not implemented rather than returning
   * an empty page — check `supportsSearch` from {@link listProviders} first.
   *
   * @example
   * ```ts
   * const { items } = await client.cloudImports.search("notion", {
   *   connectionId,
   *   query: "roadmap"
   * });
   * ```
   */
  async search(
    provider: CloudImportProviderSlug,
    params: SearchCloudItemsParams
  ): Promise<CloudItemPage> {
    return this.http.request<CloudItemPage>("GET", `/documents/imports/${provider}/search`, {
      query: { ...params }
    });
  }

  /**
   * Import the selected items into the knowledge base.
   *
   * Takes the ids `browse` and `search` return, so a selection can be imported
   * without translation.
   *
   * @param provider - `"google-drive"`, `"sharepoint"` or `"notion"`.
   * @param params - Connection, item ids, and any provider-specific extras.
   *
   * @example
   * ```ts
   * const page = await client.cloudImports.browse("google-drive", {
   *   connectionId,
   *   folderId: "root"
   * });
   *
   * const result = await client.cloudImports.import(
   *   "google-drive",
   *   { connectionId, itemIds: page.items.map((item) => item.id) }
   * );
   * console.log(`${result.importedCount} documents created`);
   * ```
   */
  async import(
    provider: CloudImportProviderSlug,
    params: ImportCloudItemsParams
  ): Promise<ImportResult> {
    return this.http.request<ImportResult>("POST", `/documents/imports/${provider}/import`, {
      body: params
    });
  }

  /**
   * Import Google Drive files and folders.
   *
   * Convenience wrapper over {@link import} — identical behaviour.
   */
  async importGoogleDrive(params: {
    connectionId: string;
    itemIds: string[];
    parentId?: string;
  }): Promise<ImportResult> {
    return this.import("google-drive", params);
  }

  /**
   * Import SharePoint files and folders. `siteId` is required: SharePoint
   * addresses items within a site.
   *
   * Convenience wrapper over {@link import} — identical behaviour.
   */
  async importSharePoint(params: {
    connectionId: string;
    siteId: string;
    itemIds: string[];
    parentId?: string;
  }): Promise<ImportResult> {
    return this.import("sharepoint", params);
  }

  /**
   * Import Notion pages and databases.
   *
   * Page and database ids are indistinguishable, so both go in `itemIds` and
   * the server resolves each one's kind.
   *
   * Convenience wrapper over {@link import} — identical behaviour.
   */
  async importNotion(params: {
    connectionId: string;
    itemIds: string[];
    parentId?: string;
  }): Promise<ImportResult> {
    return this.import("notion", params);
  }

  // ==========================================================================
  // Deprecated — these reach the original per-provider endpoints, which are
  // served by a stub. The listings answer with no files whether or not files
  // exist, and the token methods return a credential whose tokens are empty
  // strings. The three imports that used to live here are gone: `import` above
  // replaces them, and it really imports.
  // ==========================================================================

  /** @deprecated Returns a credential with empty tokens. Connect through the app instead. */
  async googleDriveAuth(body: { code: string }): Promise<unknown> {
    return this.http.request<unknown>("POST", "/documents/google-drive/auth", { body });
  }

  /** @deprecated Returns a credential with empty tokens. */
  async googleDriveRefresh(body: { refreshToken: string }): Promise<unknown> {
    return this.http.request<unknown>("POST", "/documents/google-drive/refresh", { body });
  }

  /** @deprecated Always returns no files. Use {@link browse} with a connectionId. */
  async listGoogleDriveFiles(params: {
    accessToken: string;
    folderId?: string;
    pageToken?: string;
  }): Promise<unknown> {
    return this.http.request<unknown>("GET", "/documents/google-drive/files", {
      query: params as Record<string, string | undefined>
    });
  }

  /** @deprecated Returns a credential with empty tokens. Connect through the app instead. */
  async sharePointAuth(body: { code: string }): Promise<unknown> {
    return this.http.request<unknown>("POST", "/documents/sharepoint/auth", { body });
  }

  /** @deprecated Returns a credential with empty tokens. */
  async sharePointRefresh(body: { refreshToken: string }): Promise<unknown> {
    return this.http.request<unknown>("POST", "/documents/sharepoint/refresh", { body });
  }

  /** @deprecated Always returns no sites. */
  async listSharePointSites(params: { connectionId: string }): Promise<unknown> {
    return this.http.request<unknown>("GET", "/documents/sharepoint/sites", {
      query: params as Record<string, string>
    });
  }

  /** @deprecated Always returns no files. Use {@link browse} with `siteId`. */
  async listSharePointFiles(params: {
    connectionId: string;
    siteId: string;
    folderId?: string;
  }): Promise<unknown> {
    return this.http.request<unknown>("GET", "/documents/sharepoint/files", {
      query: params as Record<string, string | undefined>
    });
  }

  /** @deprecated Returns a credential with empty tokens. Connect through the app instead. */
  async notionAuth(body: { code: string }): Promise<unknown> {
    return this.http.request<unknown>("POST", "/documents/notion/auth", { body });
  }

  /** @deprecated Always returns no pages. Use {@link search}. */
  async searchNotion(params: {
    connectionId: string;
    query?: string;
    filter?: string;
    cursor?: string;
  }): Promise<unknown> {
    return this.http.request<unknown>("GET", "/documents/notion/search", {
      query: params as Record<string, string | undefined>
    });
  }
}
