// ============================================================================
// ASSET
// ============================================================================

/**
 * An org-scoped public asset. `url` is a stable, permanent, unsigned public URL
 * usable directly in a browser (`<img src>` / `<link href>`).
 */
export interface Asset {
  /** Unique asset ID. */
  id: string;
  /** Asset name (the original uploaded filename). */
  name: string;
  /** Stable, permanent, unsigned public URL. */
  url: string;
  /** MIME type served with the object. */
  contentType: string;
  /** Byte size of the stored object. */
  sizeBytes: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-update timestamp, or null. */
  updatedAt: string | null;
}

/**
 * What `assets.delete()` actually did — TWO outcomes, reported separately.
 *
 * This route does NOT return the shared `DeleteResponse`, and the difference is
 * load-bearing rather than cosmetic. `deleted` is the ROW and is `true` whenever
 * the call returns at all (an absent or already-deleted asset is a 404).
 * `objectRemoved` is the STORED OBJECT, reclaimed on a separate call the server
 * lets fail without failing the request.
 *
 * 🔴 **THE OBJECT IS WHAT SERVES THE URL.** An asset is stored `public-read` and
 * `url` is the direct, unsigned, permanent object URL, so nothing in a browser's
 * request path consults the row. `objectRemoved: false` therefore means THE
 * PUBLIC URL IS STILL SERVING, and this field is the only signal that says so.
 * Deleting an absent key counts as success at the storage layer, so `false` is a
 * real storage failure (refused credentials, an outage, throttling) and never a
 * key that had already gone.
 *
 * **A retry is not available.** The row is already soft-deleted, so calling
 * `delete()` again answers 404. Treat a `false` as an operational escalation,
 * not as something to loop on.
 */
export interface AssetDeleteResult {
  /** ID of the deleted asset. */
  id: string;
  /** Always `true` — the row was soft-deleted. */
  deleted: true;
  /** Whether the stored object was reclaimed. `false` = the URL still serves. */
  objectRemoved: boolean;
  /** The asset's public URL — still serving while `objectRemoved` is `false`. */
  url: string;
}

/** Query parameters accepted by the asset list endpoint. */
export interface ListAssetsParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Case-insensitive substring match on the asset name. */
  search?: string;
}
