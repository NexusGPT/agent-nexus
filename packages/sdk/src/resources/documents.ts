import type { PageResponse } from "../types/common";
import type {
  AddWebsiteDocumentBody,
  CreateGoogleSheetDocumentBody,
  CreateTextDocumentBody,
  DocumentDetail,
  DocumentInfo,
  GoogleSheetResult
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
  async uploadFile(file: Blob, fileName?: string, description?: string): Promise<DocumentInfo> {
    const formData = new FormData();
    formData.append("file", file, fileName);
    if (description) {
      formData.append("description", description);
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

  async list(params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    parentId?: string;
    collectionId?: string;
    search?: string;
    isFolder?: boolean;
  }): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>("GET", "/documents", {
      query: params as Record<string, string | number | boolean | undefined>
    });
    return { data, meta: meta! };
  }

  async update(
    documentId: string,
    body: { name?: string; description?: string; tags?: string[] }
  ): Promise<any> {
    return this.http.request<any>("PATCH", `/documents/${documentId}`, { body });
  }

  async delete(documentId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/documents/${documentId}`);
  }

  /**
   * Get a signed download URL for a document file.
   * The URL includes a Content-Disposition header that triggers a browser download.
   */
  async getDownloadUrl(
    documentId: string
  ): Promise<{ url: string; fileName: string; mimeType: string | null; expiresIn: number }> {
    return this.http.request("GET", `/documents/${documentId}/download`);
  }

  /**
   * Get a signed preview URL for inline viewing of a document.
   * Unlike download, this URL does not set Content-Disposition, allowing
   * browsers to render the file inline (e.g. in an iframe).
   */
  async getPreviewUrl(
    documentId: string
  ): Promise<{ url: string; fileName: string; mimeType: string | null; expiresIn: number }> {
    return this.http.request("GET", `/documents/${documentId}/preview`);
  }

  async listChildren(
    documentId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>(
      "GET",
      `/documents/${documentId}/children`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
    return { data, meta: meta! };
  }

  async reprocess(documentId: string): Promise<any> {
    return this.http.request<any>("POST", `/documents/${documentId}/reprocess`);
  }

  async createFolder(body: { name: string; parentId?: string }): Promise<any> {
    return this.http.request<any>("POST", "/documents/folder", { body });
  }
}
