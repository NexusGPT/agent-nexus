import { appendFilePart } from "../multipart";
import type { PageResponse } from "../types/common";
import type {
  AddWebsiteDocumentBody,
  CreateDocumentFolderBody,
  CreateGoogleSheetDocumentBody,
  CreateTextDocumentBody,
  DeleteDocumentResponse,
  DocumentDetail,
  DocumentInfo,
  DocumentMetadataInput,
  DocumentSummary,
  DocumentUrlResponse,
  GoogleSheetResult,
  ListDocumentsParams,
  ReprocessDocumentResponse,
  UpdateDocumentBody
} from "../types/documents";
import { BaseResource } from "./base-resource";

/**
 * Document resource.
 *
 * Provides endpoints to retrieve, create documents via file upload, text,
 * website crawling, or Google Sheet import. Documents can then be attached to
 * knowledge collections using `client.skills.attachDocumentsToCollection()`.
 *
 * Accessed via `client.documents`.
 */
export class DocumentsResource extends BaseResource {
  /**
   * Get a document by ID.
   *
   * @param documentId - The document's UUID.
   * @returns Detailed document information.
   *
   * @example
   * ```ts
   * const doc = await client.documents.get("doc-uuid");
   * console.log(doc.name, doc.status, doc.processingProgress);
   * ```
   */
  async get(documentId: string): Promise<DocumentDetail> {
    return this.http.request<DocumentDetail>("GET", `/documents/${documentId}`);
  }

  /**
   * Upload a file as a new document.
   *
   * @param file - File as a `Blob`, `File`, or `Buffer`.
   * @param fileName - File name (required when passing a `Blob` or `Buffer`).
   * @param description - Optional description.
   * @returns Created document info.
   *
   * @example
   * ```ts
   * import fs from "fs";
   *
   * const buffer = fs.readFileSync("report.pdf");
   * const doc = await client.documents.uploadFile(
   *   new Blob([buffer]),
   *   "report.pdf",
   *   "Q4 financial report"
   * );
   * console.log(doc.id, doc.status);
   * ```
   */
  async uploadFile(
    file: Blob,
    fileName?: string,
    description?: string,
    metadata?: DocumentMetadataInput
  ): Promise<DocumentInfo> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    if (description) {
      formData.append("description", description);
    }
    if (metadata && Object.keys(metadata).length > 0) {
      formData.append("metadata", JSON.stringify(metadata));
    }
    return this.http.request<DocumentInfo>("POST", "/documents/file", { body: formData });
  }

  /**
   * Create a new document from inline text content.
   *
   * @param body - Document name, content, and optional description.
   * @returns Created document info.
   *
   * @example
   * ```ts
   * const doc = await client.documents.createText({
   *   name: "Meeting Notes",
   *   content: "Key decisions from today's meeting..."
   * });
   * ```
   */
  async createText(body: CreateTextDocumentBody): Promise<DocumentInfo> {
    return this.http.request<DocumentInfo>("POST", "/documents/text", { body });
  }

  /**
   * Crawl a website and create document(s) from the content.
   *
   * @param body - URL, crawl mode, optional config and description.
   * @returns Created document info (folder for crawled pages).
   *
   * @example
   * ```ts
   * const doc = await client.documents.addWebsite({
   *   url: "https://docs.example.com",
   *   mode: "sitemap"
   * });
   * ```
   */
  async addWebsite(body: AddWebsiteDocumentBody): Promise<DocumentInfo> {
    return this.http.request<DocumentInfo>("POST", "/documents/website", { body });
  }

  /**
   * Import a Google Sheet as document(s).
   *
   * @param body - Sheet name, URL, and optional metadata.
   * @returns Folder document, individual sheet documents, and status message.
   *
   * @example
   * ```ts
   * const result = await client.documents.createGoogleSheet({
   *   name: "Product Catalog",
   *   url: "https://docs.google.com/spreadsheets/d/..."
   * });
   * console.log(result.folder.id, result.sheets.length);
   * ```
   */
  async createGoogleSheet(body: CreateGoogleSheetDocumentBody): Promise<GoogleSheetResult> {
    return this.http.request<GoogleSheetResult>("POST", "/documents/google-sheet", { body });
  }

  /**
   * List documents and folders with optional filtering and pagination.
   *
   * `type` and `status` are enum-valued: an out-of-enum value is rejected by the
   * API with the field and the complete allowed set, and is a compile error here
   * (NEX-3087). `READY` is a document's terminal success status — poll for it,
   * not for a `COMPLETED` that does not exist.
   *
   * @param params - Optional filters and pagination.
   * @returns Paginated list of document summaries.
   *
   * @example
   * ```ts
   * const { data } = await client.documents.list({ status: "READY", limit: 10 });
   * ```
   */
  async list(params?: ListDocumentsParams): Promise<PageResponse<DocumentSummary>> {
    return this.http.requestPage<DocumentSummary>("GET", "/documents", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  /**
   * Update a document's name, description, tags or search metadata.
   *
   * @param documentId - Document UUID.
   * @param body - Fields to update.
   * @returns The updated document, in the same shape `get()` returns.
   */
  async update(documentId: string, body: UpdateDocumentBody): Promise<DocumentDetail> {
    return this.http.request<DocumentDetail>("PATCH", `/documents/${documentId}`, { body });
  }

  /**
   * Delete a document.
   *
   * @param documentId - Document UUID.
   * @returns Confirmation carrying the deleted document's id.
   */
  async delete(documentId: string): Promise<DeleteDocumentResponse> {
    return this.http.request<DeleteDocumentResponse>("DELETE", `/documents/${documentId}`);
  }

  /**
   * Get a signed download URL for a document file.
   * The URL includes a Content-Disposition header that triggers a browser download.
   */
  async getDownloadUrl(documentId: string): Promise<DocumentUrlResponse> {
    return this.http.request<DocumentUrlResponse>("GET", `/documents/${documentId}/download`);
  }

  /**
   * Get a signed preview URL for inline viewing of a document.
   * Unlike download, this URL does not set Content-Disposition, allowing
   * browsers to render the file inline (e.g. in an iframe).
   */
  async getPreviewUrl(documentId: string): Promise<DocumentUrlResponse> {
    return this.http.request<DocumentUrlResponse>("GET", `/documents/${documentId}/preview`);
  }

  /**
   * List the documents inside a folder.
   *
   * @param documentId - Folder UUID.
   * @param params - Optional pagination.
   * @returns Paginated list of document summaries.
   */
  async listChildren(
    documentId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<DocumentSummary>> {
    return this.http.requestPage<DocumentSummary>("GET", `/documents/${documentId}/children`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Re-run ingestion and embedding for a document.
   *
   * @param documentId - Document UUID.
   * @returns Acknowledgement. `message` says whether the document was queued now
   *   or was already being processed.
   */
  async reprocess(documentId: string): Promise<ReprocessDocumentResponse> {
    return this.http.request<ReprocessDocumentResponse>(
      "POST",
      `/documents/${documentId}/reprocess`
    );
  }

  /**
   * Create a folder to organize documents.
   *
   * @param body - Folder properties. `name` is required.
   * @returns The created folder.
   */
  async createFolder(body: CreateDocumentFolderBody): Promise<DocumentInfo> {
    return this.http.request<DocumentInfo>("POST", "/documents/folder", { body });
  }
}
