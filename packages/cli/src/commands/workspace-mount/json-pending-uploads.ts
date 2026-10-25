declare const jsonCountBrand: unique symbol;

/** A count that went through {@link jsonPendingUploads}: finite, so `JSON.stringify` keeps it. */
type JsonCount = number & { readonly [jsonCountBrand]: true };

/**
 * What a document's `pendingUploads` field holds. Branded so a raw count —
 * possibly the infinite sentinel — cannot be written into one: every document
 * that declares this type is forced through the function below.
 */
export type JsonPendingUploads = JsonCount | "unknown" | null;

/**
 * The `pendingUploads` a `--json` document carries.
 *
 * 🔴 THREE ANSWERS, AND `null` ALREADY MEANS ONE OF THEM. The help defines it as
 * "null on other engines" — nothing to lose. `PENDING_UPLOADS_UNKNOWN` is
 * infinite so both in-process comparisons fail safe, but `JSON.stringify`
 * renders infinity as `null`, which lands the cache we could NOT read on top of
 * the value meaning there is nothing there — the exact conflation the sentinel
 * exists to prevent, one serialisation away. It goes out as the string
 * `"unknown"` instead, which no numeric comparison can mistake for zero — and so
 * does any other count that is not finite, which `JSON.stringify` would also
 * write as `null`.
 */
export function jsonPendingUploads(count: number | null | undefined): JsonPendingUploads {
  if (count === undefined || count === null) return null;
  if (!Number.isFinite(count)) return "unknown";
  // The one mint: the line above answered every count JSON cannot carry.
  return count as JsonCount;
}
