// ============================================================================
// DOCUMENT
// ============================================================================

/**
 * Processing status of a document.
 *
 * `READY` is terminal success — there is no `COMPLETED` and no `PROCESSED`. Both
 * shipped in our own docs and example scripts, and because neither can ever be
 * true, every "poll until done" loop built on one ran to timeout and only exited
 * normally when the import FAILED. Typed as a union so a wrong literal is a
 * compile error rather than a run that never finishes (NEX-3087).
 *
 * Source of truth is the `DocumentStatus` Postgres enum, which the API validates
 * against; this package ships standalone and cannot import the generated values,
 * so the list is restated here and must be updated alongside a schema change.
 */
export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR" | "SYNCING";

/**
 * What a document IS — distinct from its source, which is where it came from
 * (`"type": "PDF"` with `"sourceType": "FILE"`, not the reverse). Restated from
 * the `DocumentType` Postgres enum, same caveat as `DocumentStatus` above.
 */
export type DocumentType =
  | "PDF"
  | "CSV"
  | "TEXT"
  | "IMAGE"
  | "AUDIO"
  | "WEBSITE_FOLDER"
  | "WEBSITE_PAGE"
  | "NOTION_PAGE"
  | "NOTION_DATABASE"
  | "GOOGLE_DOC"
  | "GOOGLE_SHEET"
  | "GOOGLE_DRIVE"
  | "SHAREPOINT"
  | "AIRTABLE_BASE"
  | "AIRTABLE_TABLE"
  | "FOLDER"
  | "UNKNOWN";

/** A document returned from creation endpoints. */
export interface DocumentInfo {
  /** Unique document ID. */
  id: string;
  /** Document name. */
  name: string;
  /** Document type (e.g. "PDF", "TEXT", "WEBSITE_PAGE", "GOOGLE_SHEET"). */
  type: string;
  /** Processing status (e.g. "PROCESSING", "READY", "ERROR"). */
  status: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Detailed document information returned from the get endpoint. */
export interface DocumentDetail {
  /** Unique document ID. */
  id: string;
  /** Document name. */
  name: string;
  /** Optional description. */
  description: string | null;
  /** Document type (e.g. "PDF", "TEXT", "WEBSITE_PAGE", "GOOGLE_SHEET"). */
  type: string;
  /** Where the document came from (e.g. "FILE", "WEBSITE", "GOOGLE_SHEET"). */
  sourceType: string | null;
  /** MIME type of the document. */
  mimeType: string | null;
  /** Processing status (e.g. "PROCESSING", "READY", "ERROR"). */
  status: string;
  /** Whether this document is a folder. */
  isFolder: boolean;
  /** Source URL (for websites or Google Sheets). */
  sourceUrl: string | null;
  /** File size in bytes. */
  size: number | null;
  /** Processing failure reason; null unless status is "ERROR". */
  errorMessage?: string | null;
  /** Total number of child documents. */
  totalChildren: number;
  /** Number of children with READY status. */
  readyChildren: number;
  /** Number of children currently processing. */
  processingChildren: number;
  /** Number of children pending processing. */
  pendingChildren: number;
  /** Number of children with errors. */
  errorChildren: number;
  /** Processing progress (0-100). */
  processingProgress: number;
  /** Document tags. */
  tags: string[];
  /** User-declared filterable attributes as stored (raw, pre-index). */
  metadata: Record<string, unknown> | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string | null;
}

/** Result from creating a Google Sheet document. */
export interface GoogleSheetResult {
  /** The parent folder document. */
  folder: DocumentInfo;
  /** Individual sheet documents. */
  sheets: DocumentInfo[];
  /** Human-readable status message. */
  message: string;
}

// ============================================================================
// CREATION BODIES
// ============================================================================

/** Body for `client.documents.createText()`. */
export interface CreateTextDocumentBody {
  /** Document name. */
  name: string;
  /** Text content. */
  content: string;
  /** Optional description. */
  description?: string;
  /** Optional filterable metadata (e.g. `{ language: "fr" }`). */
  metadata?: DocumentMetadataInput;
}

/** Body for `client.documents.addWebsite()`. */
export interface AddWebsiteDocumentBody {
  /** Website URL to crawl. */
  url: string;
  /** Crawl mode. */
  mode: "sitemap" | "crawl";
  /** Optional crawl configuration. */
  config?: {
    urls?: string[];
    max_depth?: number;
    max_pages?: number;
  };
  /** Optional description. */
  description?: string;
  /** Optional filterable metadata, inherited by every crawled page. */
  metadata?: DocumentMetadataInput;
}

/** Body for `client.documents.createGoogleSheet()`. */
export interface CreateGoogleSheetDocumentBody {
  /** Document name. */
  name: string;
  /** Google Sheet URL. */
  url: string;
  /** Optional metadata. */
  metadata?: {
    hasHeaderRow?: boolean;
  };
}

// ============================================================================
// METADATA
// ============================================================================

/**
 * User-declared, filterable document attributes (e.g. `{ language: "fr" }`).
 * Mirrors the Public API contract: scalars and arrays of scalars are accepted;
 * the server coerces every value to a string / string[] and strips reserved keys.
 */
export type DocumentMetadataInput = Record<
  string,
  string | number | boolean | Array<string | number | boolean>
>;

// ============================================================================
// COLLECTION LINKING
// ============================================================================

/** Body for `client.skills.attachDocumentsToCollection()`. */
export interface AttachCollectionDocumentsBody {
  /** Array of document IDs to link to the collection. */
  documentIds: string[];
}

/** Response from `client.skills.attachDocumentsToCollection()`. */
export interface AttachCollectionDocumentsResponse {
  /** Status message. */
  message: string;
}

// ============================================================================
// Document listing
// ============================================================================

/** One row of `client.documents.list()` and `listChildren()`. */
export interface DocumentSummary {
  /** Document UUID. */
  id: string;
  /** File or folder name. */
  name: string;
  /** Name shown in the UI, or `null` when it falls back to `name`. */
  displayName: string | null;
  /** Document type discriminator. */
  type: string;
  /** Where the document came from, or `null` for a direct upload. */
  sourceType: string | null;
  /** Processing status. */
  status: string;
  /** Whether this row is a folder rather than a document. */
  isFolder: boolean;
  /** UUID of the containing folder, or `null` at the root. */
  parentId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

/** Query parameters accepted by `client.documents.list()`. */
export interface ListDocumentsParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Restrict to one document type. Out-of-enum values are rejected by the API. */
  type?: DocumentType;
  /** Restrict to one processing status. Out-of-enum values are rejected by the API. */
  status?: DocumentStatus;
  /** Restrict to one folder. */
  parentId?: string;
  /** Restrict to documents in one collection. */
  collectionId?: string;
  /** Free-text filter on the document name. */
  search?: string;
  /** Restrict to folders, or exclude them. */
  isFolder?: boolean;
}

/** Request body for `client.documents.update()`. All fields are optional. */
export interface UpdateDocumentBody {
  /** New document name. */
  name?: string;
  /** New description. */
  description?: string;
  /** Replacement tag list. */
  tags?: string[];
  /** Replacement search metadata. */
  metadata?: DocumentMetadataInput;
}

/** Request body for `client.documents.createFolder()`. */
export interface CreateDocumentFolderBody {
  /** Folder name (required). */
  name: string;
  /** Parent folder UUID for nesting. Omit for a root-level folder. */
  parentId?: string;
}

/** Response from `client.documents.delete()`. */
export interface DeleteDocumentResponse {
  /** UUID of the deleted document. */
  id: string;
  /** Always `true` on success. */
  deleted: true;
}

/**
 * Response from `client.documents.reprocess()`.
 *
 * `status` is always `"PROCESSING"`; `message` distinguishes a newly queued
 * document from one that was already being processed.
 */
export interface ReprocessDocumentResponse {
  /** Always `"PROCESSING"`. */
  status: string;
  /** Whether the document was queued now or was already in flight. */
  message: string;
}

/** Response from `client.documents.getDownloadUrl()` and `getPreviewUrl()`. */
export interface DocumentUrlResponse {
  /** Signed URL. */
  url: string;
  /** Name to save the file as. */
  fileName: string;
  /** MIME type, or `null` when unknown. */
  mimeType: string | null;
  /** Seconds until `url` expires. */
  expiresIn: number;
}
