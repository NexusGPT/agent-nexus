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

/** Query parameters accepted by the asset list endpoint. */
export interface ListAssetsParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Case-insensitive substring match on the asset name. */
  search?: string;
}
