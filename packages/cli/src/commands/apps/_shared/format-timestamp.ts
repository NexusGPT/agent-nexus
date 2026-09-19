/**
 * Trim trailing milliseconds off the ISO timestamp the backend
 * emits — `2026-05-27T12:34:56.789Z` → `2026-05-27 12:34:56Z` —
 * so the table column doesn't dominate the row width.
 */
export function formatTimestamp(iso: string): string {
  const stripped = iso.replace(/\.\d{3}Z$/, "Z").replace("T", " ");
  return stripped;
}
