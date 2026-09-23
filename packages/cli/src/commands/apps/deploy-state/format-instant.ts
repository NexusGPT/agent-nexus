/** `2026-08-04 06:40:11Z` — the same shape the rest of `apps` prints. */
export function formatInstant(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z").replace("T", " ");
}
