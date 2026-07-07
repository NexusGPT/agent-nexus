// ============================================================================
// DOCUMENT
// ============================================================================

/** A document returned from creation endpoints. */
export interface DocumentInfo {
  /** Unique document ID. */
  id: string;
  /** Document name. */
  name: string;
  /** Document type (e.g. "FILE", "TEXT", "WEBSITE", "GOOGLE_SHEET"). */
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
  /** Document type (e.g. "FILE", "TEXT", "WEBSITE", "GOOGLE_SHEET"). */
  type: string;
  /** Source type (e.g. "UPLOAD", "CRAWL", "SITEMAP"). */
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
