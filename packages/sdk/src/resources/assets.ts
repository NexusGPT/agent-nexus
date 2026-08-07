import { withDerivedHasMore } from "../http-client";
import { appendFilePart } from "../multipart";
import type { Asset, ListAssetsParams } from "../types/assets";
import type { DeleteResponse, PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Asset resource — org-scoped public file/media hosting (NEX-2540).
 *
 * Upload an image / svg / font / css file and get back a stable, permanent,
 * public URL to drop straight into HTML (`<img src>` / `<link href>`). Types are
 * allow-listed and validated by magic bytes; SVG is sanitized before hosting.
 *
 * Accessed via `client.assets`.
 */
export class AssetsResource extends BaseResource {
  /**
   * Upload a file as a new asset.
   *
   * @param file - File as a `Blob` or `File`.
   * @param fileName - File name (required when passing a `Blob`; its extension
   *   determines the accepted asset type).
   * @returns The created asset, including its permanent public `url`.
   *
   * @example
   * ```ts
   * import fs from "fs";
   *
   * const buffer = fs.readFileSync("logo.svg");
   * const asset = await client.assets.upload(new Blob([buffer]), "logo.svg");
   * console.log(asset.url); // → https://<bucket>.s3.amazonaws.com/orgs/.../logo.svg
   * ```
   */
  async upload(file: Blob, fileName?: string): Promise<Asset> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<Asset>("POST", "/assets", { body: formData });
  }

  /**
   * List the organization's assets, newest first.
   *
   * @param params - Optional pagination and name search.
   */
  async list(params?: ListAssetsParams): Promise<PageResponse<Asset>> {
    const { data, meta } = await this.http.requestWithMeta<Asset[]>("GET", "/assets", {
      query: params as Record<string, string | number | undefined>
    });
    return {
      data,
      meta: meta ? withDerivedHasMore(meta) : { total: data.length, page: 1, hasMore: false }
    };
  }

  /**
   * Get an asset by ID.
   *
   * @param assetId - The asset's UUID.
   */
  async get(assetId: string): Promise<Asset> {
    return this.http.request<Asset>("GET", `/assets/${assetId}`);
  }

  /**
   * Delete an asset by ID.
   *
   * @param assetId - The asset's UUID.
   */
  async delete(assetId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/assets/${assetId}`);
  }
}
