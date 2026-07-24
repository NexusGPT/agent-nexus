/** A cloud storage provider, in the form used in a URL path. */
export type CloudImportProviderSlug = "google-drive" | "sharepoint" | "notion";

/** A file or folder as the provider reports it. */
export interface CloudItem {
  id: string;
  name: string;
  mimeType?: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
  createdTime?: string;
  parentId?: string;
  webUrl?: string;
  /** Provider-specific fields, passed through unchanged. */
  providerMetadata?: Record<string, unknown>;
}

/** One page of items. `nextPageToken` is absent on the last page. */
export interface CloudItemPage {
  items: CloudItem[];
  nextPageToken?: string;
}

/**
 * What a provider can do, as reported by the adapter serving it — not a
 * description of the vendor's API. `supportsSearch` is false for a provider
 * whose search is not implemented, and calling `search` on it returns an error
 * rather than an empty page.
 */
export interface CloudImportProvider {
  provider: "GOOGLE_DRIVE" | "SHAREPOINT" | "NOTION";
  slug: CloudImportProviderSlug;
  supportsFolders: boolean;
  supportsSearch: boolean;
  supportsSync: boolean;
  supportsRefreshToken: boolean;
}

export interface CloudImportProviderList {
  providers: CloudImportProvider[];
}

export interface BrowseCloudItemsParams {
  /** OAuth connection to browse with. */
  connectionId: string;
  /**
   * Container to list. Its meaning is the provider's: a Drive or SharePoint
   * folder id, a Notion database id.
   */
  folderId: string;
  /** SharePoint addresses items within a site; ignored by the other providers. */
  siteId?: string;
  pageToken?: string;
}

export interface SearchCloudItemsParams {
  connectionId: string;
  query: string;
  /** Narrows the search to one container, where the provider supports it. */
  folderId?: string;
  pageToken?: string;
}
