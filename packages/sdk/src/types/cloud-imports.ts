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
  /**
   * Name fragment, matched case-insensitively, against the item's NAME only.
   * Not a glob and not a regex.
   *
   * A file whose CONTENT mentions the term but whose name does not is never
   * returned, on any provider. On SharePoint that costs extra round trips —
   * its own search matches file bodies too, so content-only hits are discarded
   * — and a page can come back short with a `nextPageToken` to continue from.
   *
   * Trimmed before it is used, so `" T1 "` and `"T1"` are the same search on
   * every provider. A blank query is a 400 rather than a match against
   * everything — an empty fragment is a substring of every name.
   */
  query: string;
  /** Narrows the search to one container, where the provider supports it. */
  folderId?: string;
  /**
   * SharePoint addresses items within a site and REQUIRES it for search;
   * ignored by the other providers. Omitting it on SharePoint is a 400.
   */
  siteId?: string;
  pageToken?: string;
}

export interface ImportCloudItemsParams {
  /** OAuth connection to import through. */
  connectionId: string;
  /**
   * Provider ids, exactly as `browse` and `search` return them. Notion page and
   * database ids are indistinguishable, and the server resolves which is which.
   */
  itemIds: string[];
  /** Destination folder in Nexus — a document id, not a folder at the provider. */
  parentId?: string;
  /** SharePoint addresses items within a site and requires it; ignored elsewhere. */
  siteId?: string;
}

/** A document created by an import, with the processing status it starts in. */
export interface ImportedDocument {
  id: string;
  name: string;
  status: string;
}

/**
 * What an import created. `importedCount` can be lower than the number of
 * `itemIds` when an individual item is unreadable; an import that creates
 * nothing fails rather than returning a count of zero.
 */
export interface ImportResult {
  importedCount: number;
  documents: ImportedDocument[];
}
